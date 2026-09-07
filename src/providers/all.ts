import { registerAdapter } from './index';

// B4
import { comfyuiAdapter } from './comfyui';
import { a1111Adapter } from './a1111';

registerAdapter(comfyuiAdapter);
registerAdapter(a1111Adapter);
