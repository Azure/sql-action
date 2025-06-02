# Description

*Please provide a detailed description. Be as descriptive as possible - include information about what is being changed,
why it's being changed, and any links to relevant issues. If this is closing an existing issue use one of the [issue linking keywords](https://docs.github.com/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue#linking-a-pull-request-to-an-issue-using-a-keyword) to link the issue to this PR and have it automatically close when completed.*

In addition, go through the checklist below and check each item as you validate it is either handled or not applicable to this change.

# Code Changes

- [ ] [Unit tests](/__tests__/) are added, if possible
- [ ] New or changed code follows the C# style guidelines defined in .editorconfig
- [ ] All changes MUST be backwards compatible and changes to the shared `az_func.GlobalState` table must be compatible with all prior versions of the extension
- [ ] Use `core.debug` or directly log to console to display relevant information
- [ ] Use `async` and `await` for all long-running operations

# Dependencies

- [ ] If updating dependencies, run `npm install` to update the lock files and ensure that there are NO major versions updates or additional vulnerabilities in [package-lock.json](/package-lock.json). If there are, contact the dev team for instructions.

# Documentation

- [ ] Updates to the [action definition](/action.yml) should also update the [README](/README.md)
- [ ] Add [samples](/README.md#-samples) if the change is modifying or adding functionality