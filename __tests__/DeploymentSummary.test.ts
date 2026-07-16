import { buildSummary, SummaryContext, SUMMARY_MARKER } from '../src/DeploymentSummary';
import { DeploymentReport } from '../src/DeploymentReport';

describe('DeploymentSummary tests', () => {

    const baseContext: SummaryContext = {
        action: 'Publish',
        source: 'Database.dacpac',
        server: 'myserver.database.windows.net',
        database: 'mydb'
    };

    const report: DeploymentReport = {
        operations: [
            { operation: 'Create', object: '[dbo].[Reactions]', type: 'Table' },
            { operation: 'Alter', object: '[dbo].[Messages]', type: 'Table' },
            { operation: 'Drop', object: '[dbo].[OldAudit]', type: 'Table' }
        ],
        alerts: [
            { kind: 'DataIssue', detail: '[dbo].[OldAudit] will be dropped.' }
        ]
    };

    it('renders a headline with the action, source, and redacted target', () => {
        const markdown = buildSummary(baseContext);
        expect(markdown).toContain('✅ **Published** `Database.dacpac` → `myserver.database.windows.net / mydb`');
    });

    it('summarizes the change counts and data loss in the headline', () => {
        const markdown = buildSummary({ ...baseContext, report });
        expect(markdown).toContain('**3 changes** (1 created · 1 altered · 1 dropped) · ⚠️ 1 data-loss warning');
    });

    it('renders the metadata table', () => {
        const markdown = buildSummary({ ...baseContext, report });
        expect(markdown).toContain('| **Action** | Publish |');
        expect(markdown).toContain('| **Target** | `myserver.database.windows.net / mydb` |');
    });

    it('renders the duration when provided', () => {
        const markdown = buildSummary({ ...baseContext, report, durationMs: 3200 });
        expect(markdown).toContain('| **Duration** | 3.2s |');
    });

    it('renders the triggering user and commit when provided', () => {
        const markdown = buildSummary({ ...baseContext, report, actor: 'octocat', commit: 'abc1234' });
        expect(markdown).toContain('| **Triggered by** | @octocat |');
        expect(markdown).toContain('| **Commit** | `abc1234` |');
    });

    it('renders the deployment options when provided', () => {
        const markdown = buildSummary({ ...baseContext, report, options: '/p:DropObjectsNotInSource=true' });
        expect(markdown).toContain('| **Options** | `/p:DropObjectsNotInSource=true` |');
    });

    it('renders the by-type and by-schema breakdowns', () => {
        const markdown = buildSummary({ ...baseContext, report });
        expect(markdown).toContain('**By type:** Table ×3');
        expect(markdown).toContain('**By schema:** dbo ×3');
    });

    it('renders a collapsible section per change category', () => {
        const markdown = buildSummary({ ...baseContext, report });
        expect(markdown).toContain('<summary>➕ Created (1)</summary>');
        expect(markdown).toContain('<summary>🔄 Altered (1)</summary>');
        expect(markdown).toContain('<summary>🗑️ Dropped (1)</summary>');
        expect(markdown).toContain('| `[dbo].[Reactions]` | Table |');
    });

    it('escapes pipe characters in object names so the table is not broken', () => {
        const markdown = buildSummary({ ...baseContext, report: { operations: [{ operation: 'Create', object: '[dbo].[Odd|Name]', type: 'Table' }], alerts: [] } });
        expect(markdown).toContain('[dbo].[Odd\\|Name]');
    });

    it('renders a data-loss callout when alerts are present', () => {
        const markdown = buildSummary({ ...baseContext, report });
        expect(markdown).toContain('### ⚠️ Possible data loss (1)');
        expect(markdown).toContain('> - [dbo].[OldAudit] will be dropped.');
    });

    it('omits the data-loss callout when there are no alerts', () => {
        const markdown = buildSummary({ ...baseContext, report: { operations: report.operations, alerts: [] } });
        expect(markdown).not.toContain('Possible data loss');
    });

    it('renders a no-changes message for an empty report', () => {
        const markdown = buildSummary({ ...baseContext, report: { operations: [], alerts: [] } });
        expect(markdown).toContain('no schema changes');
        expect(markdown).toContain('### 📦 Changes');
    });

    it('truncates a section beyond the row limit', () => {
        const operations = Array.from({ length: 150 }, (_, index) => ({ operation: 'Create', object: `[dbo].[Table${index}]`, type: 'Table' }));
        const markdown = buildSummary({ ...baseContext, report: { operations, alerts: [] } });
        expect(markdown).toContain('_…and 50 more_');
    });

    it('embeds the deployment script in a collapsible block with batch and size counts', () => {
        const markdown = buildSummary({ ...baseContext, script: 'CREATE TABLE [dbo].[Reactions] (Id INT);\nGO' });
        expect(markdown).toContain('📄 Deployment T-SQL script · 1 batch ·');
        expect(markdown).toContain('CREATE TABLE [dbo].[Reactions] (Id INT);');
    });

    it('truncates a very large deployment script', () => {
        const markdown = buildSummary({ ...baseContext, script: 'A'.repeat(40000) });
        expect(markdown).toContain('Script truncated for display');
    });

    it('strips a leading byte order mark from the script', () => {
        const markdown = buildSummary({ ...baseContext, script: '\uFEFFCREATE TABLE [dbo].[Reactions] (Id INT);' });
        expect(markdown).not.toContain('\uFEFF');
        expect(markdown).toContain('CREATE TABLE [dbo].[Reactions] (Id INT);');
    });

    it('renders a run link in the footer when provided', () => {
        const markdown = buildSummary({ ...baseContext, report, runUrl: 'https://github.com/o/r/actions/runs/1' });
        expect(markdown).toContain('Generated by <b>Azure SQL Deploy</b>');
        expect(markdown).toContain('<a href="https://github.com/o/r/actions/runs/1">View run</a>');
    });

    it('ends with the sticky comment marker', () => {
        const markdown = buildSummary({ ...baseContext, report });
        expect(markdown.replace(/\s+$/, '').endsWith(SUMMARY_MARKER)).toBe(true);
    });

    it('never includes a password even if one is present in the context object', () => {
        const markdown = buildSummary({ ...baseContext, report, options: '/p:DropObjectsNotInSource=true' });
        expect(markdown).not.toContain('Password');
        expect(markdown).not.toContain('placeholder');
    });
});
