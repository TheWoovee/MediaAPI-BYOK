import { registerAdapter } from './index';

// B2 — core cloud adapters
import { cfWorkersAiAdapter } from './cf-workers-ai';
import { xaiAdapter } from './xai';
import { openaiAdapter } from './openai';
import { openaiCompatAdapter } from './openai-compat';
import { googleAdapter } from './google';

// B3 — serverless provider adapters
import { falAdapter } from './fal';
import { replicateAdapter } from './replicate';
import { hfInferenceAdapter } from './hf-inference';
import { hfSpaceAdapter } from './hf-space';
import { runpodAdapter } from './runpod';

// B4 — local servers
import { comfyuiAdapter } from './comfyui';
import { a1111Adapter } from './a1111';

registerAdapter(cfWorkersAiAdapter);
registerAdapter(xaiAdapter);
registerAdapter(openaiAdapter);
registerAdapter(openaiCompatAdapter);
registerAdapter(googleAdapter);

registerAdapter(falAdapter);
registerAdapter(replicateAdapter);
registerAdapter(hfInferenceAdapter);
registerAdapter(hfSpaceAdapter);
registerAdapter(runpodAdapter);

registerAdapter(comfyuiAdapter);
registerAdapter(a1111Adapter);
