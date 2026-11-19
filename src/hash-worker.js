import {sha256} from '@noble/hashes/sha2.js';
import {hex} from './protocol.js';
onmessage=async({data:{id,file}})=>{try{const hash=sha256.create();for(let start=0;start<file.size;start+=1024*1024){hash.update(new Uint8Array(await file.slice(start,start+1024*1024).arrayBuffer()));postMessage({id,progress:Math.min(1,(start+1024*1024)/file.size)});}postMessage({id,hash:hex(hash.digest())});}catch(e){postMessage({id,error:e.message});}};
