import OpenAI from 'openai';
import config from '../config/index.js';
import { logger } from '../utils/logger.js';

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  timeout: config.openai.timeout * 1000,
});

export interface OpenAIRequest {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface OpenAIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callOpenAI(request: OpenAIRequest, retries = 0): Promise<OpenAIResponse> {
  const { prompt, temperature, maxTokens, topP } = request;
  
  try {
    logger.debug('Calling OpenAI API', {
      model: config.openai.model,
      temperature: temperature ?? config.openai.temperature,
      maxTokens: maxTokens ?? config.openai.maxTokens,
    });

    const completion = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: 'You are a career intelligence analyst. Return only valid JSON without markdown formatting.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: temperature ?? config.openai.temperature,
      max_tokens: maxTokens ?? config.openai.maxTokens,
      top_p: topP ?? config.openai.topP,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content || '';
    const usage = completion.usage;

    logger.info('OpenAI API call successful', {
      tokens: usage?.total_tokens,
      finishReason: completion.choices[0]?.finish_reason,
    });

    return {
      content,
      usage: usage
        ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          }
        : undefined,
    };
  } catch (error: any) {
    const isRateLimitError = error?.status === 429 || error?.code === 'rate_limit_exceeded';
    const isServerError = error?.status >= 500;
    const shouldRetry = (isRateLimitError || isServerError) && retries < config.ai.retry.max;

    if (shouldRetry) {
      const backoffMs = config.ai.retry.backoffSec * 1000 * Math.pow(2, retries);
      logger.warn(`OpenAI API error (attempt ${retries + 1}/${config.ai.retry.max}), retrying in ${backoffMs}ms`, {
        error: error?.message,
        status: error?.status,
      });
      await sleep(backoffMs);
      return callOpenAI(request, retries + 1);
    }

    logger.error('OpenAI API call failed', {
      error: error?.message,
      status: error?.status,
      code: error?.code,
      retries,
    });
    throw error;
  }
}

export async function validateJSON(jsonString: string, schema?: any): Promise<{ valid: boolean; data?: any; error?: string }> {
  try {
    const data = JSON.parse(jsonString);
    
    // Basic validation - check top-level structure
    if (!data.query_id || !data.job || !data.data || !data.provenance) {
      return {
        valid: false,
        error: 'Missing required top-level fields: query_id, job, data, or provenance',
      };
    }

    // If schema provided, could add AJV validation here
    // For now, basic structural validation is sufficient
    
    return { valid: true, data };
  } catch (error: any) {
    return {
      valid: false,
      error: error.message,
    };
  }
}

export default { callOpenAI, validateJSON };
