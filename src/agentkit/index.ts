import { DynamicStructuredTool } from "@langchain/core/tools";
import { Action, ActionProvider } from "./action-provider";
import { z } from "zod";

export * from "./agentRuntime";
export * from "./identity-provider";
export * from "./func-utils";
export * from "./types";
export * from "./blockchain";
export * from "./attestations/attestations";

/**
 * Get Langchain tools from provider instance
 *
 * @param provider - The instance of provider with registered tools
 * @returns An array of Langchain tools
 */
export async function getTools(
  provider: ActionProvider
): Promise<DynamicStructuredTool[]> {
  const actions: Action[] = provider.getActions();
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return actions.map(
    (action) =>
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      new DynamicStructuredTool({
        name: action.name,
        description: action.description,
        func: async (arg: z.output<typeof action.schema>) => {
          return await action.invoke(arg);
        },
        schema: action.schema,
        responseFormat: action.response_format,
      })
  ) as DynamicStructuredTool[];
}
