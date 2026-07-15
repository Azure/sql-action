import { XMLParser } from 'fast-xml-parser';

/**
 * A single schema change that SqlPackage reports it will apply to the target,
 * for example creating a table or altering a stored procedure.
 */
export interface DeploymentOperation {
    /** The operation kind reported by SqlPackage, e.g. "Create", "Alter", "Drop". */
    operation: string;
    /** The fully qualified object name, e.g. "[dbo].[Products]". */
    object: string;
    /** A friendly object type, e.g. "Table", "Procedure", "View". */
    type: string;
}

/**
 * A warning SqlPackage raises about a deployment. The most important category is
 * possible data loss, for example dropping a table or a column.
 */
export interface DeploymentAlert {
    /** The alert category reported by SqlPackage, e.g. "DataIssue". */
    kind: string;
    /** The object or description the alert refers to. */
    detail: string;
}

/**
 * The parsed result of a SqlPackage deployment report, produced either by the
 * DeployReport action or by the /DeployReportPath parameter of a Publish.
 */
export interface DeploymentReport {
    operations: DeploymentOperation[];
    alerts: DeploymentAlert[];
}

const EMPTY_REPORT: DeploymentReport = { operations: [], alerts: [] };

/**
 * Parses the XML of a SqlPackage deployment report into a structured summary.
 * The parse is namespace-agnostic and tolerant of missing or malformed input:
 * blank, unparseable, or unexpected XML yields an empty report rather than an error.
 * @param xml The raw deployment report XML.
 * @returns The operations and alerts described by the report.
 */
export function parseDeploymentReport(xml: string): DeploymentReport {
    if (!xml || xml.trim() === '') {
        return { operations: [], alerts: [] };
    }

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_'
    });

    let parsed: any;
    try {
        parsed = parser.parse(xml);
    } catch {
        return { operations: [], alerts: [] };
    }

    const root = parsed && parsed.DeploymentReport;
    if (!root) {
        return { operations: [], alerts: [] };
    }

    return {
        operations: parseOperations(root),
        alerts: parseAlerts(root)
    };
}

/**
 * Reads every &lt;Operation&gt;/&lt;Item&gt; pair under the report root into a flat list.
 */
function parseOperations(root: any): DeploymentOperation[] {
    const operations: DeploymentOperation[] = [];
    const operationNodes = toArray(root.Operations && root.Operations.Operation);

    for (const operationNode of operationNodes) {
        const operationName = attribute(operationNode, 'Name') || 'Unknown';
        for (const item of toArray(operationNode.Item)) {
            operations.push({
                operation: operationName,
                object: attribute(item, 'Value') || '',
                type: friendlyType(attribute(item, 'Type'))
            });
        }
    }

    return operations;
}

/**
 * Reads every &lt;Alert&gt;/&lt;Issue&gt; pair under the report root into a flat list.
 */
function parseAlerts(root: any): DeploymentAlert[] {
    const alerts: DeploymentAlert[] = [];
    const alertNodes = toArray(root.Alerts && root.Alerts.Alert);

    for (const alertNode of alertNodes) {
        const kind = attribute(alertNode, 'Name') || 'Alert';
        for (const issue of toArray(alertNode.Issue)) {
            alerts.push({
                kind,
                detail: attribute(issue, 'Value') || ''
            });
        }
    }

    return alerts;
}

/**
 * Converts a SqlPackage type name into a human-friendly label, e.g. "SqlProcedure"
 * becomes "Procedure" and "SqlPrimaryKeyConstraint" becomes "Primary Key Constraint".
 */
function friendlyType(type: string | undefined): string {
    if (!type) {
        return 'Object';
    }

    const withoutPrefix = type.replace(/^Sql/, '');
    const spaced = withoutPrefix.replace(/([a-z])([A-Z])/g, '$1 $2');
    return spaced || type;
}

/**
 * Reads an attribute value from a node parsed by fast-xml-parser, tolerating
 * both attribute-only nodes and nodes with child content.
 */
function attribute(node: any, name: string): string | undefined {
    if (node === undefined || node === null) {
        return undefined;
    }
    const value = node['@_' + name];
    return value === undefined || value === null ? undefined : String(value);
}

/**
 * Normalizes a value that fast-xml-parser may return as a single object or an
 * array into an array, so callers can iterate uniformly.
 */
function toArray<T>(value: T | T[] | undefined): T[] {
    if (value === undefined || value === null) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}
