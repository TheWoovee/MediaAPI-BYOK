import { registerAdapter } from './index';

// B3 — serverless provider adapters
import { falAdapter } from './fal';
import { replicateAdapter } from './replicate';
import { hfInferenceAdapter } from './hf-inference';
import { hfSpaceAdapter } from './hf-space';
import { runpodAdapter } from './runpod';

registerAdapter(falAdapter);
registerAdapter(replicateAdapter);
registerAdapter(hfInferenceAdapter);
registerAdapter(hfSpaceAdapter);
registerAdapter(runpodAdapter);
