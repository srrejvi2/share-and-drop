import Peer from 'peerjs';
import {sha256} from '@noble/hashes/sha2.js';
import {CHUNK,WINDOW,SecureWire,createSecret,importSecret,sleep,validOffset,hex} from './protocol.js';
import {createSink} from './storage.js';
import {originSignal} from './network.js';
export const DEFAULT_ICE=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}];
const uid=()=>crypto.randomUUID();
const errorText=err=>({ 'peer-unavailable':'The host is unavailable. Keep the host page open and check that this is the latest link.', 'network':'The connection service is unavailable. Check your internet connection.', 'browser-incompatible':'This browser does not support WebRTC file transfer.', 'server-error':'The connection service could not be reached.', 'unavailable-id':'This session could not be started. Please try again.' }[err.type]||err.message||'The connection was interrupted.');
export function options(config={}){return {...(config.signal||originSignal(location)),debug:0,config:{iceServers:config.iceServers?.length?config.iceServers:DEFAULT_ICE,iceTransportPolicy:config.relayOnly?'relay':'all'},pingInterval:5000};}
class Events extends EventTarget{emit(type,detail={}){this.dispatchEvent(new CustomEvent(type,{detail}));}update(){this.emit('change');}}
function peerOpen(peer){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{peer.destroy();reject(Error('Connection service timed out. Check your connection or use your own signaling server in settings.'));},20000);peer.once('open',id=>{clearTimeout(timer);resolve(id);});peer.once('error',err=>{clearTimeout(timer);reject(Error(errorText(err)));});peer.once('close',()=>{clearTimeout(timer);reject(Error('Session was closed.'));});});}
async function route(conn){
 try{const report=await conn.peerConnection.getStats();let pair;report.forEach(s=>{if(s.type==='transport'&&s.selectedCandidatePairId)pair=report.get(s.selectedCandidatePairId);});if(!pair)report.forEach(s=>{if(s.type==='candidate-pair'&&s.state==='succeeded'&&s.nominated)pair=s;});if(!pair)return {mode:'Connecting',rtt:null};const local=report.get(pair.localCandidateId),remote=report.get(pair.remoteCandidateId);return {mode:local?.candidateType==='relay'||remote?.candidateType==='relay'?'TURN relay':local?.candidateType==='host'&&remote?.candidateType==='host'?'Direct / LAN':'Direct P2P',rtt:pair.currentRoundTripTime!=null?Math.round(pair.currentRoundTripTime*1000):null};}catch{return {mode:'Connecting',rtt:null};}
}
class HashQueue{
 constructor(){this.worker=new Worker(new URL('/assets/hash-worker.js',location.origin),{type:'module'});this.items=new Map();this.queue=[];this.busy=false;this.worker.onmessage=({data})=>{const item=this.items.get(data.id);if(!item)return;if(data.hash||data.error){data.error?item.reject(Error(data.error)):item.resolve(data.hash);this.items.delete(data.id);this.busy=false;this.next();}};this.worker.onerror=()=>{for(const item of this.items.values())item.reject(Error('Unable to verify this file. Please select it again.'));this.items.clear();this.queue=[];};}
 add(id,file){const promise=new Promise((resolve,reject)=>this.items.set(id,{resolve,reject}));promise.catch(()=>{});this.queue.push({id,file});this.next();return promise;}
 next(){if(this.busy||!this.queue.length)return;this.busy=true;this.worker.postMessage(this.queue.shift());}
 close(){this.worker.terminate();for(const item of this.items.values())item.reject(Error('Session ended'));this.items.clear();}
}
export class HostSession extends Events{
 constructor(files,config={},dependencies={}){super();this.PeerClass=dependencies.PeerClass||Peer;this.config=config;this.files=files.map(file=>({id:uid(),file,meta:{id:null,name:file.name.slice(0,180),path:(file.webkitRelativePath||file.name).slice(0,500),size:file.size,type:file.type.slice(0,100)}}));this.files.forEach(f=>f.meta.id=f.id);this.secret=createSecret();this.id='srd-'+uid();this.receivers=new Map();this.logs=[];this.active=false;this.away=false;this.expiresAt=config.expiry?Date.now()+Number(config.expiry)*60000:0;this.network='Connecting';}
 async start(){
  if(!this.files.length||this.files.length>100)throw Error('Choose between 1 and 100 files.');
  this.key=await importSecret(this.secret);this.hashes=new HashQueue();this.files.forEach(f=>f.hash=this.hashes.add(f.id,f.file));
  this.peer=new this.PeerClass(this.id,options(this.config));this.peer.on('connection',conn=>this.accept(conn));this.peer.on('error',err=>{this.emit('notice',{message:errorText(err)});});
  this.peer.on('disconnected',()=>{if(!this.active)return;this.network='Reconnecting';this.update();setTimeout(()=>{if(this.active&&!this.peer.destroyed&&this.peer.disconnected){try{this.peer.reconnect();}catch{}}},1500);});
  this.peer.on('open',()=>{this.network='Ready';this.update();});
  try{await peerOpen(this.peer);}catch(err){this.hashes.close();this.peer.destroy();throw err;}
  this.active=true;this.timer=setInterval(()=>this.tick(),2000);this.update();return this;
 }
 accept(conn){
  if(!this.active||this.receivers.size>=10){conn.on('open',()=>conn.close());return;}
  const p={id:conn.connectionId,conn,name:'Connecting device',authed:false,status:'Authenticating',bytes:0,size:0,mode:'Connecting',rtt:null,lastSeen:Date.now(),connectedAt:Date.now(),job:null};
  this.receivers.set(p.id,p);p.wire=new SecureWire(conn,this.key,(h,data)=>this.message(p,h,data),()=>{p.status='Authentication failed';this.update();});
  let authTimer=setTimeout(()=>{if(!p.authed)conn.close();},35000);conn.on('open',()=>{clearTimeout(authTimer);authTimer=setTimeout(()=>{if(!p.authed)conn.close();},12000);});
  conn.on('close',()=>{clearTimeout(authTimer);if(p.job)p.job.cancelled=true;this.receivers.delete(p.id);this.update();});conn.on('error',()=>{p.status='Connection interrupted';this.update();});this.update();
 }
 async message(p,h){
  p.lastSeen=Date.now();
  if(!p.authed){if(h.type!=='hello'||h.version!==1)throw Error('Invalid handshake');p.authed=true;p.name=String(h.name||'Receiver').slice(0,40);p.status='Ready';await p.wire.send({type:'welcome',version:1,count:this.files.length,expiresAt:this.expiresAt,away:this.away});for(const f of this.files)await p.wire.send({type:'file',file:f.meta});await p.wire.send({type:'ready'});this.update();return;}
  if(h.type==='ping'){await p.wire.send({type:'pong',time:h.time,away:this.away});return;}
  if(h.type==='pong')return;
  if(h.type==='preview'){const f=this.files.find(f=>f.id===h.fileId);if(!f)return;await this.preview(p,f);return;}
  if(h.type==='start'){
   const f=this.files.find(f=>f.id===h.fileId);if(!f||!validOffset(h.offset,f.file.size)||typeof h.transfer!=='string'||h.transfer.length>80)throw Error('Invalid transfer request');
   if(p.job)p.job.cancelled=true;
   const job={file:f,transfer:h.transfer,sent:h.offset,ack:h.offset,startOffset:h.offset,started:Date.now(),lastAck:Date.now(),paused:false,cancelled:false};p.job=job;p.bytes=h.offset;p.size=f.file.size;p.status='Sending';
   this.pump(p,job).catch(async err=>{if(job.cancelled||!this.active)return;p.status='Waiting to retry';this.update();await p.wire.send({type:'transfer-error',transfer:job.transfer,message:err.message}).catch(()=>{});});this.update();return;
  }
  const job=p.job;if(!job||h.transfer!==job.transfer)return;
  if(h.type==='ack'){if(!validOffset(h.offset,job.file.file.size)||h.offset<job.ack||h.offset>job.sent)throw Error('Invalid acknowledgment');job.ack=h.offset;job.lastAck=Date.now();p.bytes=h.offset;this.update();}
  if(h.type==='pause'){job.paused=true;p.status='Paused';this.update();}
  if(h.type==='resume'){job.paused=false;job.lastAck=Date.now();p.status='Sending';this.update();}
  if(h.type==='verification-failed'){job.cancelled=true;p.status='Verification failed';p.job=null;this.update();}
  if(h.type==='cancel'){job.cancelled=true;p.status='Cancelled';p.job=null;this.update();}
  if(h.type==='verified'&&job.ack===job.file.file.size){p.status='Completed';const seconds=(Date.now()-job.started)/1000;this.logs.unshift({time:new Date().toISOString(),file:job.file.meta.name,bytes:job.file.file.size,transferredThisAttempt:job.ack-job.startOffset,seconds:+seconds.toFixed(2),averageMBps:+((job.ack-job.startOffset)/Math.max(seconds,.001)/1e6).toFixed(3),mode:p.mode,latencyMs:p.rtt,receivers:this.receivers.size,sha256:'verified'});p.job=null;this.update();}
 }
 async pump(p,job){
  const current=()=>this.active&&!job.cancelled&&p.conn.open&&p.job===job;
  while(job.sent<job.file.file.size){
   if(!current())return;
   if(job.paused){await sleep(60);continue;}
   if(Date.now()-job.lastAck>30000)throw Error('Receiver stopped responding. Retry from the last saved chunk.');
   if(job.sent-job.ack>=WINDOW){await sleep(10);continue;}
   const offset=job.sent,data=new Uint8Array(await job.file.file.slice(offset,offset+CHUNK).arrayBuffer());if(!current())return;
   // Advance before sending, so a fast ACK cannot race the sent-byte boundary.
   job.sent+=data.length;await p.wire.send({type:'chunk',transfer:job.transfer,offset},data);
  }
  while(current()&&job.ack<job.file.file.size){if(!job.paused&&Date.now()-job.lastAck>30000)throw Error('Waiting for receiver timed out.');await sleep(20);}
  if(!current())return;p.status='Verifying';this.update();const hash=await job.file.hash;if(!current())return;await p.wire.send({type:'end',transfer:job.transfer,size:job.file.file.size,hash});
 }
 async preview(p,f){
  if(f.meta.type.startsWith('text/')||/\.(txt|md|csv|json|log)$/i.test(f.meta.name)){await p.wire.send({type:'preview',fileId:f.id,kind:'text',content:await f.file.slice(0,3000).text()});return;}
  if(/^image\/(png|jpeg|webp|gif)$/.test(f.meta.type)&&f.file.size<=10*1024*1024){try{const bitmap=await createImageBitmap(f.file);const scale=Math.min(1,240/bitmap.width,180/bitmap.height),canvas=new OffscreenCanvas(Math.max(1,bitmap.width*scale),Math.max(1,bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await canvas.convertToBlob({type:'image/jpeg',quality:.55});if(blob.size>16000)throw Error();const bytes=new Uint8Array(await blob.arrayBuffer());await p.wire.send({type:'preview',fileId:f.id,kind:'image',content:'data:image/jpeg;base64,'+btoa(String.fromCharCode(...bytes))});return;}catch{}}
  await p.wire.send({type:'preview',fileId:f.id,kind:'none',content:'No preview available. You can still download this file.'});
 }
 setAway(away){this.away=away;for(const p of this.receivers.values())if(p.authed)p.wire.send({type:'presence',away}).catch(()=>{});this.update();}
 async tick(){if(!this.active)return;if(this.expiresAt&&Date.now()>=this.expiresAt){await this.stop('This sharing session has expired.');return;}for(const p of this.receivers.values()){if(Date.now()-p.lastSeen>60000){p.conn.close();continue;}Object.assign(p,await route(p.conn));}this.update();}
 async stop(reason='The host ended this session.'){
  if(!this.active&&!this.peer)return;this.active=false;clearInterval(this.timer);this.hashes?.close();for(const p of this.receivers.values())if(p.job)p.job.cancelled=true;
  await Promise.race([Promise.all([...this.receivers.values()].map(p=>p.wire.send({type:'revoked',message:reason}).catch(()=>{}))),sleep(80)]);await sleep(30);this.peer?.destroy();this.files=[];this.receivers.clear();this.emit('ended',{reason});this.update();
 }
 destroy(){this.active=false;clearInterval(this.timer);this.hashes?.close();this.peer?.destroy();this.files=[];this.receivers.clear();}
}
export class ReceiverSession extends Events{
 constructor(id,secret,config={},dependencies={}){super();this.PeerClass=dependencies.PeerClass||Peer;this.id=id;this.secret=secret;this.config=config;this.files=[];this.previews=new Map();this.results=new Map();this.logs=[];this.name=config.name||(/Mobi|Android/i.test(navigator.userAgent)?'Phone':'Computer');this.status='Connecting';this.mode='Connecting';this.rtt=null;this.current=null;this.ended=false;this.away=false;this.retryCount=0;this.lastSeen=Date.now();this.completedSinks=[];this.memoryUsed=0;}
 async start(){this.key=await importSecret(this.secret);this.peer=new this.PeerClass('srr-'+uid(),options(this.config));this.peer.on('error',err=>{this.status=errorText(err);this.update();if(err.type==='peer-unavailable')this.retry();});this.peer.on('disconnected',()=>{if(!this.ended)setTimeout(()=>{if(!this.peer.destroyed&&this.peer.disconnected){try{this.peer.reconnect();}catch{}}},1500);});await peerOpen(this.peer);this.connect();this.timer=setInterval(()=>this.tick(),2500);return this;}
 connect(){
  if(this.ended||this.connecting)return;this.connecting=true;this.status=this.current?'Reconnecting · keeping received chunks':'Connecting to host';this.update();
  this.previousRead=this.wire?.readQueue||Promise.resolve();
  const conn=this.peer.connect(this.id,{reliable:true,serialization:'raw',label:'share-drop-v1'});this.conn=conn;
  const wire=new SecureWire(conn,this.key,(h,data)=>this.message(h,data,conn),err=>{if(!conn.open&&['Connection closed','Connection stalled'].includes(err.message))return;if(this.conn===conn){this.authFailed=true;this.status=err.name==='OperationError'?'Could not authenticate this link. Ask the host for a new link.':err.name==='QuotaExceededError'?'Receiver storage is full. Free space, then restart this download.':'Transfer stopped: '+err.message;const job=this.current;if(job&&!job.done){job.done=true;job.sink.dispose().catch(()=>{});job.reject(Error(this.status));}this.update();}});this.wire=wire;
  const timeout=setTimeout(()=>{if(this.conn===conn&&this.connecting){this.connecting=false;this.lastConnectFailure='No peer route found. Keep both pages open, check the network, or configure a TURN relay in Settings.';conn.close();this.retry();}},25000);
  conn.on('open',()=>{if(this.conn!==conn)return;this.lastSeen=Date.now();wire.send({type:'hello',version:1,name:this.name}).catch(()=>{});});
  conn.on('close',()=>{clearTimeout(timeout);if(this.conn!==conn)return;this.connecting=false;if(!this.ended&&!this.authFailed){this.status='Host connection interrupted · received chunks kept';this.update();this.retry();}});conn.on('error',()=>{clearTimeout(timeout);if(this.conn===conn){this.connecting=false;this.retry();}});
 }
 async message(h,data,conn){
  if(this.conn!==conn||this.ended)return;this.lastSeen=Date.now();
  if(h.type==='welcome'){if(h.version!==1||!Number.isInteger(h.count)||h.count<1||h.count>100)throw Error('Unsupported file list');this.expectedCount=h.count;this.incoming=[];this.expiresAt=h.expiresAt;this.away=h.away;return;}
  if(h.type==='file'){const meta=h.file;if(!meta||!this.incoming||this.incoming.length>=this.expectedCount||typeof meta.id!=='string'||meta.id.length>80||typeof meta.name!=='string'||meta.name.length>180||typeof meta.path!=='string'||meta.path.length>500||typeof meta.type!=='string'||meta.type.length>100||!Number.isSafeInteger(meta.size)||meta.size<0)throw Error('Invalid file information');this.incoming.push(meta);return;}
  if(h.type==='ready'){
   await this.previousRead;
   if(!this.incoming||this.incoming.length!==this.expectedCount||new Set(this.incoming.map(f=>f.id)).size!==this.incoming.length)throw Error('Incomplete file list');this.files=this.incoming;this.incoming=null;this.connecting=false;this.retryCount=0;this.status='Ready to download';if(this.current&&!this.current.done){if(!this.files.some(f=>f.id===this.current.meta.id&&f.size===this.current.meta.size))throw Error('The shared file changed');await this.request();}this.emit('ready');this.update();return;
  }
  if(h.type==='revoked'){this.end(h.message||'The host ended this session.');return;}
  if(h.type==='presence'){this.away=!!h.away;this.update();return;}
  if(h.type==='pong'){this.away=!!h.away;this.rtt=Math.max(0,Date.now()-h.time);this.update();return;}
  if(h.type==='preview'){if(['text','image','none'].includes(h.kind)&&typeof h.content==='string'&&h.content.length<24000){if(h.kind==='image'&&!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(h.content))return;this.previews.set(h.fileId,h);this.update();}return;}
  const job=this.current;if(!job||job.done||h.transfer!==job.transfer)return;
  if(h.type==='chunk'){
   if(h.offset!==job.offset||data.length!==Math.min(CHUNK,job.meta.size-job.offset)||!data.length)throw Error('Unexpected file chunk');
   await job.sink.write(data);if(job.done)return;job.hash.update(data);job.offset+=data.length;if(this.conn===conn)await this.wire.send({type:'ack',transfer:job.transfer,offset:job.offset}).catch(()=>{});this.update();return;
  }
  if(h.type==='transfer-error'){job.failed=true;job.paused=true;this.status=h.message||'Transfer interrupted. Press Resume to retry.';this.update();return;}
  if(h.type==='end'){
   if(job.offset!==job.meta.size||h.size!==job.meta.size||hex(job.hash.digest())!==h.hash){await job.sink.dispose();job.done=true;await this.wire.send({type:'verification-failed',transfer:job.transfer}).catch(()=>{});job.reject(Error('SHA-256 verification failed. The incomplete file was discarded.'));this.status='Verification failed';this.update();return;}
   const result=await job.sink.finish();job.done=true;job.result=result;this.completedSinks.push(job.sink);this.results.set(job.meta.id,{...result,hash:h.hash,verified:true});this.status='Download verified';await this.wire.send({type:'verified',transfer:job.transfer}).catch(()=>{});const seconds=(Date.now()-job.started)/1000;this.logs.unshift({time:new Date().toISOString(),file:job.meta.name,bytes:job.meta.size,seconds:+seconds.toFixed(2),averageMBps:+(job.meta.size/Math.max(.001,seconds)/1e6).toFixed(3),mode:this.mode,latencyMs:this.rtt,sha256:h.hash});job.resolve(result);this.emit('complete',{file:job.meta,result});this.update();
  }
 }
 async download(meta,{picker=false,sink=null}={}){
  if(this.ended)throw Error('This session has ended.');if(this.current&&!this.current.done)throw Error('Finish or cancel the current download first.');if(!this.conn?.open||this.connecting)throw Error('Wait for the host connection.');
  const target=sink||await createSink(meta,{picker});if(target.mode==='memory'&&this.memoryUsed+meta.size>128*1024*1024){await target.dispose();throw Error('In-memory downloads reached 128 MB. Save your completed files and leave this session, then reconnect, or use a browser with disk storage.');}if(target.mode==='memory')this.memoryUsed+=meta.size;const job={meta,sink:target,hash:sha256.create(),offset:0,started:Date.now(),paused:false,done:false,transfer:uid()};job.promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});job.promise.catch(()=>{});this.current=job;
  try{await this.request();}catch(err){await target.dispose();job.done=true;job.reject(err);throw err;}return job.promise;
 }
 async request(){const job=this.current;if(!job||job.done||!this.conn?.open)return;job.transfer=uid();await this.wire.send({type:'start',fileId:job.meta.id,offset:job.offset,transfer:job.transfer});if(job.paused)await this.wire.send({type:'pause',transfer:job.transfer});this.status=job.paused?'Paused':'Downloading';this.update();}
 async pause(){const job=this.current;if(!job||job.done)return;job.paused=true;await this.wire.send({type:'pause',transfer:job.transfer}).catch(()=>{});this.status='Paused';this.update();}
 async resume(){const job=this.current;if(!job||job.done)return;job.paused=false;if(this.conn?.open){if(job.failed){await this.wire.readQueue;job.failed=false;await this.request();}else{await this.wire.send({type:'resume',transfer:job.transfer});this.status='Downloading';}}else{this.retryCount=0;this.connect();}this.update();}
 async cancel(){const job=this.current;if(!job||job.done)return;job.done=true;await this.wire?.send({type:'cancel',transfer:job.transfer}).catch(()=>{});await job.sink.dispose();if(job.sink.mode==='memory')this.memoryUsed-=job.meta.size;job.reject(Error('Download cancelled'));this.status='Ready to download';this.current=null;this.update();}
 async preview(fileId){await this.wire?.send({type:'preview',fileId});}
 retry(){if(this.ended||this.authFailed||this.retryTimer||this.conn?.open)return;if(++this.retryCount>4){this.status=this.lastConnectFailure||'Host unavailable. Reopen the link while the host is online.';this.update();return;}this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.connecting=false;this.connect();},Math.min(8000,1000*2**(this.retryCount-1)));}
 async tick(){if(this.ended)return;if(this.conn?.open){await this.wire.send({type:'ping',time:Date.now()}).catch(()=>{});Object.assign(this,await route(this.conn));if(Date.now()-this.lastSeen>12000){this.away=true;this.status='Host is away or unreachable · waiting to resume';}if(Date.now()-this.lastSeen>30000){this.conn.close();}}this.update();}
 end(message='The host ended this session.'){
  this.ended=true;this.status=message;clearInterval(this.timer);clearTimeout(this.retryTimer);this.peer?.destroy();const job=this.current;if(job&&!job.done){job.done=true;job.sink.dispose();job.reject(Error(message));}this.emit('ended',{message});this.update();
 }
 destroy(){this.end('You left the session.');this.completedSinks.forEach(s=>s.dispose());}
}
