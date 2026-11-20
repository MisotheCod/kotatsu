// One adapter per runtime. The bridge never talks to Hermes or Claude directly, only through this interface.
// Adding a new kind of agent later means writing one more adapter, nothing else.

import type { Runtime } from "@kotatsu/shared";

export interface ApprovalRequest {
  title: string;          // one plain sentence: "Deploy the UXLens pricing page?"
  command?: string;       // the exact command or tool call, shown in mono
  tool?: string;
}

export interface TurnHandlers {
  /** Full reply text so far. Called many times while the agent streams. */
  delta(textSoFar: string): void;
  /** The agent wants to do something that needs a yes. Resolve when the user decides. */
  approval(req: ApprovalRequest): Promise<"approve" | "reject">;
  /** Short status for the Running now list, e.g. "Running tests". */
  status?(text: string): void;
}

export interface TurnInput {
  sessionId?: string;     // undefined on the first message in a channel
  channelId: string;
  text: string;           // what the user (or another agent) said, with @mentions left in
  context: string;        // who is in the channel, how to post nudges and watches. Prepended on first turn.
  cwd?: string;           // project folder, when the channel is a project
  model?: string;         // model to run this turn on, when the chat asked for one
}

export interface TurnResult {
  sessionId: string;      // stored so the next message continues the same session
  text: string;           // final reply, markdown
}

export interface AgentAdapter {
  readonly runtime: Runtime;
  start(): Promise<void>;
  online(): boolean;
  turn(input: TurnInput, on: TurnHandlers, signal: AbortSignal): Promise<TurnResult>;
}
