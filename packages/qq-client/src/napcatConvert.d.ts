import type { ForwardMessage } from './types/index';
import type { WSSendReturn } from './types/onebot-types';
export declare function napCatForwardMultiple(messages: WSSendReturn['get_forward_msg']['messages']): ForwardMessage[];
