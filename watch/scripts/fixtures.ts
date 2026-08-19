// Shared test fixture: a standalone /sprint run log in the exact format
// sprint/SKILL.md documents. One copy, imported by both test files, so
// the two can't silently drift apart.
export const SPRINT_STANDALONE = `ORDER: ABC-12, ABC-15, ABC-9 (serial)
WAVE: ABC-12 ABC-15
ABC-12 dispatched
ABC-15 dispatched
ABC-12 returned complete, PR #204, 2 review rounds, head a1b2c3f, ready-to-merge, tracker: Trello/Sprint Board
DECISION: auth errors now surface as 401 not 500 (ABC-12)
ABC-15 returned blocked: acceptance criteria don't cover expired tokens
ABC-15 parked
WAVE: ABC-9
ABC-9 dispatched
`;
