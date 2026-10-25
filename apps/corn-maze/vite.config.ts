import {defineConfig} from 'vite';
export default defineConfig({server:{host:'127.0.0.1',proxy:{'/sync':{target:'ws://127.0.0.1:4317',ws:true,changeOrigin:true,rewriteWsOrigin:true},'/api':{target:'http://127.0.0.1:4317',changeOrigin:true}}}});
