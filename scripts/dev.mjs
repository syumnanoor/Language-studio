import http from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import handler from '../api/index.js';
const root=resolve('dist');
http.createServer((req,res)=>{
 if(req.url.startsWith('/api/'))return handler(req,res);
 const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));
 if(!p.startsWith(root+sep)||!existsSync(p)){res.writeHead(404);return res.end('Not found');}
 const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}[extname(p)];
 res.writeHead(200,{'Content-Type':type||'text/plain','Cache-Control':'no-store'});res.end(readFileSync(p));
}).listen(4320,'127.0.0.1',()=>console.log('Preview http://127.0.0.1:4320'));
