import { z } from "zod";
import { ACTION_DECORATOR_KEY, StoredActionMetadata } from "./func-utils";
import { Config, ResponseFormat } from "./types";
import { KMS } from "@0xpolygonid/js-sdk";

/**
 * Action is the interface for all actions.
 */
export interface Action<TActionSchema extends z.ZodSchema = z.AnyZodObject> {
  name: string;
  description: string;
  schema: TActionSchema;
  invoke: (args: z.infer<TActionSchema>) => Promise<TActionSchema>;
  response_format: ResponseFormat;
}

/**
 * ActionProvider is the abstract base class for tools registry.
 *
 * @abstract
 */
export abstract class ActionProvider {
  private readonly _agentKms: KMS;
  private readonly _config: Config;

  /**
   * The constructor for the action provider.
   *
   * @param agentKms
   * @param config
   */
  protected constructor(agentKms: KMS, config: Config) {
    this._agentKms = agentKms;
    this._config = config;

    const keyProvider = agentKms.getKeyProvider(this._config.keyType);
    if (!keyProvider) {
      throw new Error(`keyProvider not found for: ${this._config.keyType}`);
    }
  }

  getActions(): Action[] {
    const actions: Action[] = [];

    const actionsMetadataMap: StoredActionMetadata | undefined =
      Reflect.getMetadata(ACTION_DECORATOR_KEY, this.constructor);

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    for (const actionMetadata of actionsMetadataMap.values()) {
      actions.push({
        name: actionMetadata.name,
        description: actionMetadata.description,
        schema: actionMetadata.schema,
        response_format: actionMetadata.response_format,
        invoke: (schemaArgs) => {
          const args: unknown[] = [];
          args.push(this._agentKms);
          args.push(this._config);
          args.push(schemaArgs);
          return actionMetadata.invoke.apply(this, args);
        },
      });
    }

    return actions;
  }
}
