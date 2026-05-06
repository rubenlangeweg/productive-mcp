import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const WhoAmIArgsSchema = z.object({});

export const whoAmIOutputSchema = z.object({
  configured: z.boolean(),
  userId: z.string().optional(),
  fullName: z.string().optional(),
  email: z.string().optional(),
  message: z.string(),
});

export async function whoAmI(
  client: ProductiveAPIClient,
  args: unknown,
  config?: { PRODUCTIVE_USER_ID?: string }
): Promise<{ content: Array<{ type: string; text: string }>; structuredContent?: z.infer<typeof whoAmIOutputSchema> }> {
  try {
    WhoAmIArgsSchema.parse(args);

    if (!config?.PRODUCTIVE_USER_ID) {
      const message = 'No user is configured. Set PRODUCTIVE_USER_ID environment variable to enable user context.';
      return {
        content: [{ type: 'text', text: message }],
        structuredContent: { configured: false, message },
      };
    }

    try {
      const response = await client.listPeople({ limit: 1 });
      const currentUser = response.data.find(person => person.id === config.PRODUCTIVE_USER_ID);

      if (currentUser) {
        const fullName = `${currentUser.attributes.first_name} ${currentUser.attributes.last_name}`.trim();
        const message = `Current user: ${fullName} (ID: ${config.PRODUCTIVE_USER_ID}, Email: ${currentUser.attributes.email})\n\nWhen you use "me" in any command, it refers to this user.`;
        return {
          content: [{ type: 'text', text: message }],
          structuredContent: {
            configured: true,
            userId: config.PRODUCTIVE_USER_ID,
            fullName,
            email: currentUser.attributes.email,
            message,
          },
        };
      }
    } catch {
      // If we can't fetch user details, fall through to ID-only response
    }

    const message = `Current user ID: ${config.PRODUCTIVE_USER_ID}\n\nWhen you use "me" in any command, it refers to this user ID.`;
    return {
      content: [{ type: 'text', text: message }],
      structuredContent: { configured: true, userId: config.PRODUCTIVE_USER_ID, message },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const whoAmITool = {
  name: 'whoami',
  description: 'Get the current user context. Shows which user ID is configured as "me" for all operations.',
  annotations: { readOnlyHint: true, idempotentHint: true, title: 'Who am I' },
  inputSchema: { type: 'object', properties: {} },
  outputSchema: whoAmIOutputSchema.shape,
};