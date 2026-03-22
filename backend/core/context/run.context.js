/**
 * Lightweight per-run context store.
 * Holds the active project ID so token usage can be attributed to a project
 * without threading projectId through every function signature.
 * Set at workflow run start and cleared in the finally block.
 */

let _projectId = null;

export function setActiveRunProject(id)  { _projectId = id || null; }
export function clearActiveRunProject()  { _projectId = null; }
export function getActiveRunProject()    { return _projectId; }
