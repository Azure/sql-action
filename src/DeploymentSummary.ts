import { DeploymentReport, DeploymentOperation, DeploymentAlert } from './DeploymentReport';

/** Hidden marker used to find and update the action's sticky pull request comment. */
export const SUMMARY_MARKER = '<!-- sql-action:deployment-summary -->';

/** Maximum number of object rows rendered in a single section before truncating. */
const MAX_ROWS_PER_SECTION = 100;

/** Maximum number of data-loss alerts rendered before truncating. */
const MAX_ALERTS = 25;

/** Maximum length of the embedded deployment script before it is truncated. */
const MAX_SCRIPT_LENGTH = 30000;

/** A recognized change category and how it is displayed. */
interface OperationGroup {
    key: string;
    label: string;
    icon: string;
}

/** The change categories, in the order they are displayed. */
const OPERATION_GROUPS: OperationGroup[] = [
    { key: 'create', label: 'Created', icon: '➕' },
    { key: 'alter', label: 'Altered', icon: '🔄' },
    { key: 'drop', label: 'Dropped', icon: '🗑️' }
];

/**
 * The information required to render a deployment summary. The target is limited
 * to server and database on purpose; credentials are never included.
 */
export interface SummaryContext {
    /** Human-readable action label, e.g. "Publish" or "SQL script". */
    action: string;
    /** The source file that was deployed, e.g. "Database.dacpac". */
    source: string;
    /** Target server host, without credentials. */
    server: string;
    /** Target database name. */
    database: string;
    /** The parsed deployment report, if one was captured. */
    report?: DeploymentReport;
    /** The generated deployment T-SQL script, if one was captured. */
    script?: string;
    /** How long the deployment took, in milliseconds. */
    durationMs?: number;
    /** The additional SqlPackage arguments the deployment ran with. */
    options?: string;
    /** The user that triggered the workflow run. */
    actor?: string;
    /** The short commit SHA the deployment was built from. */
    commit?: string;
    /** A link to the workflow run. */
    runUrl?: string;
}

/**
 * Renders a deployment summary as GitHub-flavored Markdown, suitable for both the
 * job summary and a pull request comment. The output always ends with SUMMARY_MARKER
 * so a previously posted comment can be located and updated in place.
 * @param context The action, target, and captured report/script to render.
 * @returns The summary as a Markdown string.
 */
export function buildSummary(context: SummaryContext): string {
    const lines: string[] = [];

    lines.push('## 🗄️ SQL deployment summary');
    lines.push('');
    lines.push(renderHeadline(context));
    lines.push('');
    pushAll(lines, renderMetadataTable(context));

    if (context.report) {
        pushAll(lines, renderChanges(context.report));
    }

    if (context.script && context.script.trim() !== '') {
        lines.push('');
        pushAll(lines, renderScript(context.script));
    }

    pushAll(lines, renderFooter(context));

    lines.push('');
    lines.push(SUMMARY_MARKER);

    return lines.join('\n');
}

/**
 * Renders the one-line, at-a-glance headline describing the deployment.
 */
function renderHeadline(context: SummaryContext): string {
    const target = `\`${context.server} / ${context.database}\``;
    const head = `✅ **${pastTenseAction(context.action)}** \`${context.source}\` → ${target}`;

    if (!context.report) {
        return `${head}.`;
    }

    const operations = context.report.operations;
    if (operations.length === 0) {
        return `${head} — no schema changes.`;
    }

    const total = operations.length;
    const changes = `**${total} change${total === 1 ? '' : 's'}** (${countsPhrase(operations)})`;
    const alertCount = context.report.alerts.length;
    const dataLoss = alertCount > 0 ? ` · ⚠️ ${alertCount} data-loss warning${alertCount === 1 ? '' : 's'}` : '';
    return `${head} — ${changes}${dataLoss}`;
}

/**
 * Renders the key/value metadata table, omitting rows whose value is unavailable.
 */
function renderMetadataTable(context: SummaryContext): string[] {
    const rows: Array<[string, string]> = [];
    rows.push(['Action', context.action]);
    rows.push(['Source', `\`${context.source}\``]);
    rows.push(['Target', `\`${context.server} / ${context.database}\``]);
    if (context.durationMs !== undefined) {
        rows.push(['Duration', formatDuration(context.durationMs)]);
    }
    if (context.actor) {
        rows.push(['Triggered by', `@${context.actor}`]);
    }
    if (context.commit) {
        rows.push(['Commit', `\`${context.commit}\``]);
    }
    if (context.options) {
        rows.push(['Options', `\`${escapeCell(context.options)}\``]);
    }

    const lines: string[] = ['| | |', '|---|---|'];
    for (const [key, value] of rows) {
        lines.push(`| **${key}** | ${value} |`);
    }
    return lines;
}

/**
 * Renders the changes section: totals, breakdowns, grouped object tables, and alerts.
 */
function renderChanges(report: DeploymentReport): string[] {
    const lines: string[] = [];
    const operations = report.operations;

    lines.push('');
    if (operations.length === 0) {
        lines.push('### 📦 Changes');
        lines.push('');
        lines.push('_No schema changes — the target database already matches the source._');
    } else {
        lines.push(`### 📦 Changes (${operations.length})`);
        lines.push('');
        pushAll(lines, renderBreakdowns(operations));
        lines.push('');
        pushAll(lines, renderGroupedOperations(operations));
    }

    if (report.alerts.length > 0) {
        lines.push('');
        pushAll(lines, renderAlerts(report.alerts));
    }

    return lines;
}

/**
 * Renders the "by type" and "by schema" one-line breakdowns of the changes.
 */
function renderBreakdowns(operations: DeploymentOperation[]): string[] {
    const byType = countBy(operations, operation => operation.type);
    const bySchema = countBy(operations, operation => schemaOf(operation.object));
    return [
        `**By type:** ${formatCounts(byType)}  `,
        `**By schema:** ${formatCounts(bySchema)}`
    ];
}

/**
 * Renders each change category (Created, Altered, Dropped, Other) as a collapsible table.
 */
function renderGroupedOperations(operations: DeploymentOperation[]): string[] {
    const lines: string[] = [];
    let isFirstSection = true;

    for (const group of OPERATION_GROUPS) {
        const items = operations.filter(operation => categoryOf(operation.operation) === group.key);
        if (items.length === 0) {
            continue;
        }
        pushAll(lines, renderSection(`${group.icon} ${group.label} (${items.length})`, items, isFirstSection));
        lines.push('');
        isFirstSection = false;
    }

    const others = operations.filter(operation => categoryOf(operation.operation) === 'other');
    if (others.length > 0) {
        pushAll(lines, renderSection(`▫️ Other (${others.length})`, others, isFirstSection));
        lines.push('');
    }

    if (lines[lines.length - 1] === '') {
        lines.pop();
    }
    return lines;
}

/**
 * Renders a single collapsible section containing a table of objects.
 */
function renderSection(title: string, items: DeploymentOperation[], open: boolean): string[] {
    const lines: string[] = [];
    lines.push(`<details${open ? ' open' : ''}>`);
    lines.push(`<summary>${title}</summary>`);
    lines.push('');
    lines.push('| Object | Type |');
    lines.push('|--------|------|');

    const shown = items.slice(0, MAX_ROWS_PER_SECTION);
    for (const item of shown) {
        lines.push(`| \`${escapeCell(item.object)}\` | ${escapeCell(item.type)} |`);
    }
    const remaining = items.length - shown.length;
    if (remaining > 0) {
        lines.push(`| _…and ${remaining} more_ | |`);
    }

    lines.push('');
    lines.push('</details>');
    return lines;
}

/**
 * Renders the data-loss alerts as a highlighted callout, truncating beyond MAX_ALERTS.
 */
function renderAlerts(alerts: DeploymentAlert[]): string[] {
    const lines: string[] = [];
    lines.push(`### ⚠️ Possible data loss (${alerts.length})`);
    lines.push('');
    lines.push('> These operations may destroy data. Review carefully before merging.');

    const details = dedupe(alerts.map(alert => alert.detail).filter(detail => detail !== ''));
    for (const detail of details.slice(0, MAX_ALERTS)) {
        lines.push(`> - ${detail}`);
    }
    const remaining = details.length - Math.min(details.length, MAX_ALERTS);
    if (remaining > 0) {
        lines.push(`> - _…and ${remaining} more_`);
    }

    return lines;
}

/**
 * Renders the deployment script inside a collapsible block with batch and size
 * counts, truncating the content beyond MAX_SCRIPT_LENGTH.
 */
function renderScript(script: string): string[] {
    const lines: string[] = [];
    const stripped = stripLeadingBom(script);
    const batches = (stripped.match(/^\s*GO\s*$/gim) || []).length;

    let content = stripped;
    let truncated = false;
    if (content.length > MAX_SCRIPT_LENGTH) {
        content = content.slice(0, MAX_SCRIPT_LENGTH);
        truncated = true;
    }

    const metaParts: string[] = [];
    if (batches > 0) {
        metaParts.push(`${batches} batch${batches === 1 ? '' : 'es'}`);
    }
    metaParts.push(`${stripped.length} chars`);

    lines.push('<details>');
    lines.push(`<summary>📄 Deployment T-SQL script · ${metaParts.join(' · ')}</summary>`);
    lines.push('');
    lines.push('```sql');
    lines.push(content.replace(/\s+$/, ''));
    if (truncated) {
        lines.push('');
        lines.push('-- Script truncated for display. See the deployment-script-path output for the full script.');
    }
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    return lines;
}

/**
 * Renders the footer with attribution and, when available, a link to the run.
 */
function renderFooter(context: SummaryContext): string[] {
    const parts = ['🤖 Generated by <b>Azure SQL Deploy</b>'];
    if (context.runUrl) {
        parts.push(`<a href="${context.runUrl}">View run</a>`);
    }
    return ['', `<sub>${parts.join(' · ')}</sub>`];
}

/**
 * Produces a change-count phrase such as "2 created · 1 altered · 1 dropped".
 */
function countsPhrase(operations: DeploymentOperation[]): string {
    const parts: string[] = [];
    for (const group of OPERATION_GROUPS) {
        const count = operations.filter(operation => categoryOf(operation.operation) === group.key).length;
        if (count > 0) {
            parts.push(`${count} ${group.label.toLowerCase()}`);
        }
    }
    const otherCount = operations.filter(operation => categoryOf(operation.operation) === 'other').length;
    if (otherCount > 0) {
        parts.push(`${otherCount} other`);
    }
    return parts.join(' · ');
}

/**
 * Maps a SqlPackage operation name to one of the known change categories.
 */
function categoryOf(operation: string): string {
    switch (operation.toLowerCase()) {
        case 'create':
            return 'create';
        case 'alter':
            return 'alter';
        case 'drop':
            return 'drop';
        default:
            return 'other';
    }
}

/**
 * Extracts the schema name from a fully qualified object name such as "[dbo].[Foo]".
 */
function schemaOf(object: string): string {
    const match = /^\[?([^\].[]+)\]?\./.exec(object);
    return match ? match[1] : 'unknown';
}

/**
 * Counts operations by a key selector, returning [key, count] pairs sorted by count.
 */
function countBy(operations: DeploymentOperation[], selector: (operation: DeploymentOperation) => string): Array<[string, number]> {
    const counts = new Map<string, number>();
    for (const operation of operations) {
        const key = selector(operation);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((first, second) => second[1] - first[1]);
}

/**
 * Formats [key, count] pairs as "Key ×count · Key ×count".
 */
function formatCounts(counts: Array<[string, number]>): string {
    return counts.map(([key, count]) => `${key} ×${count}`).join(' · ');
}

/**
 * Escapes a value so it can be safely placed in a Markdown table cell, where an
 * unescaped pipe would otherwise be interpreted as a column separator.
 */
function escapeCell(value: string): string {
    return value.replace(/\|/g, '\\|');
}

/**
 * Formats a duration in milliseconds as a compact, human-readable string.
 */
function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    const seconds = ms / 1000;
    if (seconds < 60) {
        return `${seconds.toFixed(1)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.round(seconds % 60);
    return `${minutes}m ${remainder}s`;
}

/**
 * Returns the past-tense verb describing a SqlPackage action.
 */
function pastTenseAction(action: string): string {
    switch (action.toLowerCase()) {
        case 'publish':
            return 'Published';
        case 'script':
            return 'Scripted';
        case 'deployreport':
            return 'Analyzed';
        case 'driftreport':
            return 'Drift-checked';
        default:
            return 'Deployed';
    }
}

/**
 * Removes a leading UTF-8 byte order mark, which SqlPackage writes at the start
 * of the deployment script file.
 */
function stripLeadingBom(value: string): string {
    return value.replace(/^\uFEFF/, '');
}

/**
 * Removes duplicate strings while preserving their first-seen order.
 */
function dedupe(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        if (!seen.has(value)) {
            seen.add(value);
            result.push(value);
        }
    }
    return result;
}

/**
 * Appends every item of source onto target in place, avoiding large spread calls.
 */
function pushAll(target: string[], source: string[]): void {
    for (const item of source) {
        target.push(item);
    }
}
