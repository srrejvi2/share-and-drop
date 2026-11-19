export const CHUNK=16*1024;
export const WINDOW=CHUNK*8;
export const MEMORY_LIMIT=128*1024*1024;
const encoder=new TextEncoder(), decoder=new TextDecoder();
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function b64(bytes){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function unb64(value){if(!/^[a-zA-Z0-9_-]+$/.test(value))throw Error('Invalid sharing key');return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
export function createSecret(){return b64(crypto.getRandomValues(new Uint8Array(32)));}
export async function importSecret(value){const raw=unb64(value);if(raw.length!==32)throw Error('Invalid sharing key');return crypto.subtle.importKey('raw',raw,'HKDF',false,['deriveKey']);}
export async function deriveKey(master,connectionId){return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode(connectionId),info:encoder.encode('S&D transfer v1')},master,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export function encodeFrame(header,payload=new Uint8Array()){
 const json=encoder.encode(JSON.stringify(header));
 if(json.length>32768||payload.byteLength>CHUNK)throw Error('Frame too large');
 const output=new Uint8Array(4+json.length+payload.byteLength);new DataView(output.buffer).setUint32(0,json.length);output.set(json,4);output.set(new Uint8Array(payload),4+json.length);return output;
}
export function decodeFrame(bytes){
 bytes=new Uint8Array(bytes);if(bytes.length<4)throw Error('Invalid frame');const n=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
 if(n>32768||n>bytes.length-4||bytes.length-4-n>CHUNK)throw Error('Invalid frame length');
 const header=JSON.parse(decoder.decode(bytes.subarray(4,4+n)));if(!header||typeof header!=='object'||typeof header.type!=='string')throw Error('Invalid message');
 return {header,payload:bytes.subarray(4+n)};
}
export async function seal(key,header,payload){const iv=crypto.getRandomValues(new Uint8Array(12)),plain=encodeFrame(header,payload);const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('SRDROP1')},key,plain));const frame=new Uint8Array(12+data.length);frame.set(iv);frame.set(data,12);return frame.buffer;}
export async function open(key,frame){const bytes=new Uint8Array(frame);if(bytes.length<32||bytes.length>CHUNK+32800)throw Error('Invalid encrypted packet');return decodeFrame(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12),additionalData:encoder.encode('SRDROP1')},key,bytes.subarray(12)));}
export function validOffset(offset,size){return Number.isSafeInteger(offset)&&offset>=0&&offset<=size&&(offset===size||offset%CHUNK===0);}
export function safeName(name){return String(name).replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g,'_').replace(/^\.+/,'_').slice(0,180)||'download';}
export function hex(bytes){return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function waitForDrain(channel){
 const start=Date.now();while(channel.bufferedAmount>256*1024){if(channel.readyState!=='open')throw Error('Connection closed');if(Date.now()-start>30000)throw Error('Connection stalled');await sleep(15);}if(channel.readyState!=='open')throw Error('Connection closed');
}
export class SecureWire{
 constructor(conn,master,onFrame,onError=()=>{}){
  this.conn=conn;this.key=deriveKey(master,conn.connectionId);this.sendQueue=Promise.resolve();this.readQueue=Promise.resolve();this.pending=0;
  conn.on('data',data=>{
   if(++this.pending>128){conn.close();onError(Error('Peer exceeded the receive window'));return;}
   this.readQueue=this.readQueue.then(async()=>{const frame=await open(await this.key,data);await onFrame(frame.header,frame.payload);}).catch(err=>{onError(err);conn.close();}).finally(()=>this.pending--);
  });
 }
 send(header,payload){const run=this.sendQueue.then(async()=>{if(!this.conn.open)throw Error('Connection closed');await waitForDrain(this.conn.dataChannel);this.conn.send(await seal(await this.key,header,payload));});this.sendQueue=run.catch(()=>{});return run;}
}
