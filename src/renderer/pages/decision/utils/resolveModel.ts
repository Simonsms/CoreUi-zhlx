import type { TProviderWithModel } from '@/common/config/storage';
import { getDefaultGeminiModel } from '@renderer/pages/conversation/utils/createConversationParams';

/**
 * 根据 conversation type 获取合适的 model 配置。
 * - gemini/aionrs: 需要有效的 provider + model 配置
 * - acp/codex 等: model 由后端自管理，传空对象即可
 */
export async function resolveModelForConversationType(
  conversationType: string
): Promise<TProviderWithModel> {
  if (conversationType === 'gemini') {
    try {
      const provider = await getDefaultGeminiModel();
      // 决策会话优先使用 flash 避免 pro-preview 限速
      if (provider.useModel === 'auto' || provider.useModel?.includes('pro')) {
        provider.useModel = 'gemini-3-flash-preview';
      }
      return provider;
    } catch {
      // 无 Gemini 模型配置时返回 Google Auth + flash
      return {
        id: 'gemini-placeholder',
        name: 'Gemini',
        useModel: 'gemini-3-flash-preview',
        platform: 'gemini-with-google-auth' as TProviderWithModel['platform'],
        baseUrl: '',
        apiKey: '',
      };
    }
  }

  if (conversationType === 'aionrs') {
    try {
      return await getDefaultGeminiModel();
    } catch {
      return {} as TProviderWithModel;
    }
  }

  // acp, codex 等类型：模型由 backend 自管理
  return {} as TProviderWithModel;
}
