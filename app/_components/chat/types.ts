export type Message = {
  id: number;
  role: "assistant" | "user";
  text: string;
};

export type ChatThread = {
  id: number;
  title: string;
  preview: string;
  updatedAt: string;
  messages: Message[];
};

export type ChatUiConfig = {
  sidebar: {
    badge: string;
    title: string;
    description: string;
  };
  mobileIntro: {
    badge: string;
    description: string;
  };
  header: {
    eyebrow: string;
    title: string;
    status: string;
  };
  composer: {
    label: string;
    helperText: string;
    placeholder: string;
    sendLabel: string;
    clearDraftLabel: string;
    quickPromptsLabel: string;
    loadingLabel: string;
  };
  actions: {
    newChatLabel: string;
    clearChatLabel: string;
    clearDraftLabel: string;
  };
  sections: {
    recentChatsLabel: string;
  };
  quickPrompts: string[];
};

export type ChatShellData = {
  config: ChatUiConfig;
  threads: ChatThread[];
};

export type CreateThreadResponse = ChatShellData & {
  activeChatId: number;
};

export type ThreadResponse = {
  thread: ChatThread;
};

export type ThreadsResponse = {
  threads: ChatThread[];
};

export type SendMessageRequest = {
  text: string;
  model?: string;
};

export type ChatModelOption = {
  label: string;
  value: string;
};

export type ChatModelsResponse = {
  defaultModel: string;
  models: ChatModelOption[];
};

export type AddChatModelRequest = {
  model: string;
};
