import * as fs from 'fs';
import * as path from 'path';
import { parseDeploymentReport } from '../src/DeploymentReport';

describe('DeploymentReport tests', () => {

    const fixture = fs.readFileSync(path.join(__dirname, '..', '__testdata__', 'deployReport.xml'), 'utf8');

    it('parses every create, alter, and drop operation', () => {
        const report = parseDeploymentReport(fixture);
        expect(report.operations).toHaveLength(4);
    });

    it('captures the operation name, object, and friendly type', () => {
        const report = parseDeploymentReport(fixture);
        expect(report.operations).toContainEqual({ operation: 'Create', object: '[dbo].[Reactions]', type: 'Table' });
        expect(report.operations).toContainEqual({ operation: 'Create', object: '[dbo].[GetUserMentions]', type: 'Procedure' });
        expect(report.operations).toContainEqual({ operation: 'Alter', object: '[dbo].[Messages]', type: 'Table' });
        expect(report.operations).toContainEqual({ operation: 'Drop', object: '[dbo].[OldAudit]', type: 'Table' });
    });

    it('parses data-loss alerts', () => {
        const report = parseDeploymentReport(fixture);
        expect(report.alerts).toHaveLength(1);
        expect(report.alerts[0].kind).toBe('DataIssue');
        expect(report.alerts[0].detail).toContain('[dbo].[OldAudit]');
    });

    it('handles a report with a single operation that is not an array', () => {
        const xml = `<?xml version="1.0"?><DeploymentReport><Operations><Operation Name="Create"><Item Value="[dbo].[Only]" Type="SqlTable" /></Operation></Operations></DeploymentReport>`;
        const report = parseDeploymentReport(xml);
        expect(report.operations).toEqual([{ operation: 'Create', object: '[dbo].[Only]', type: 'Table' }]);
    });

    it('returns an empty report when there are no operations', () => {
        const xml = `<?xml version="1.0"?><DeploymentReport></DeploymentReport>`;
        const report = parseDeploymentReport(xml);
        expect(report.operations).toHaveLength(0);
        expect(report.alerts).toHaveLength(0);
    });

    it('returns an empty report for blank input', () => {
        const report = parseDeploymentReport('   ');
        expect(report.operations).toHaveLength(0);
        expect(report.alerts).toHaveLength(0);
    });

    it('returns an empty report for unparseable input', () => {
        const report = parseDeploymentReport('this is not xml <<<');
        expect(report.operations).toHaveLength(0);
        expect(report.alerts).toHaveLength(0);
    });

    it('expands a multi-word type name into a friendly label', () => {
        const xml = `<?xml version="1.0"?><DeploymentReport><Operations><Operation Name="Create"><Item Value="[dbo].[PK]" Type="SqlPrimaryKeyConstraint" /></Operation></Operations></DeploymentReport>`;
        const report = parseDeploymentReport(xml);
        expect(report.operations[0].type).toBe('Primary Key Constraint');
    });
});
