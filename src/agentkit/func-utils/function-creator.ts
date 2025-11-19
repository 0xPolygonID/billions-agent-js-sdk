import { z } from "zod";
import "reflect-metadata";
import { ResponseFormat } from "../types";

/**
 * Parameters for the create function decorator
 */
export interface CreateFunctionParams {
  /**
   * The name of the action
   */
  name: string;

  /**
   * The description of the action
   */
  description: string;

  /**
   * The schema of the action
   */
  schema: z.AnyZodObject;

  /**
   * Enum that determines whether tool returns additional data or not
   */
  response_format: ResponseFormat;
}

export const ACTION_DECORATOR_KEY = Symbol("agentkit:action");

/**
 * Metadata for AgentKit actions
 */
export interface ActionMetadata {
  /**
   * The name of the action
   */
  name: string;

  /**
   * The description of the action
   */
  description: string;

  /**
   * The schema of the action
   */
  schema: z.AnyZodObject;

  /**
   * The function to invoke the action
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoke: (...args: any[]) => any;

  /**
   * Enum that determines whether tool returns additional data or not
   */
  response_format: ResponseFormat;
}

/**
 * A map of action names to their metadata
 */
export type StoredActionMetadata = Map<string, ActionMetadata>;

export function CreateFunction(params: CreateFunctionParams) {
  return (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) => {
    const prefixedActionName = `${target.constructor.name}_${params.name}`;

    const originalMethod = descriptor.value;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    descriptor.value = function (...args: any[]) {
      return originalMethod.apply(this, args);
    };

    const existingMetadata: StoredActionMetadata =
      Reflect.getMetadata(ACTION_DECORATOR_KEY, target.constructor) ||
      new Map();

    const metaData: ActionMetadata = {
      name: prefixedActionName,
      description: params.description,
      schema: params.schema,
      invoke: descriptor.value,
      response_format: params.response_format,
    };

    existingMetadata.set(propertyKey, metaData);

    Reflect.defineMetadata(
      ACTION_DECORATOR_KEY,
      existingMetadata,
      target.constructor
    );
  };
}
