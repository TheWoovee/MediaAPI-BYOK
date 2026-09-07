import { registerAdapter } from './index';

// B2
import { cfWorkersAiAdapter } from './cf-workers-ai';
import { xaiAdapter } from './xai';
import { openaiAdapter } from './openai';
import { openaiCompatAdapter } from './openai-compat';
import { googleAdapter } from './google';

registerAdapter(cfWorkersAiAdapter);
registerAdapter(xaiAdapter);
registerAdapter(openaiAdapter);
registerAdapter(openaiCompatAdapter);
registerAdapter(googleAdapter);
