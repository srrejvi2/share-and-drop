// Deterministic test transport. It exercises the production protocol and session
// code, but deliberately does NOT claim to test WebRTC, ICE, or the network.
class Emitter{constructor(){this.handlers=new Map();}on(n,fn){if(!this.handlers.has(n))this.handlers.set(n,[]);this.handlers.get(n).push(fn);return this;}once(n,fn){const wrap=(...args)=>{this.handlers.set(n,(this.handlers.get(n)||[]).filter(x=>x!==wrap));fn(...args);};return this.on(n,wrap);}emit(n,...args){for(const f of this.handlers.get(n)||[])f(...args);}}
const registry=new Map();
class Connection extends Emitter{
 constructor(id,remote){super();this.connectionId=id;this.peer=remote;this.open=false;this.dataChannel={bufferedAmount:0,readyState:'connecting'};this.peerConnection={getStats:async()=>new Map(),iceConnectionState:'connected'};}
 send(data){if(!this.open)throw Error('Closed');const clone=data.slice(0);this.dataChannel.bufferedAmount+=clone.byteLength;setTimeout(()=>{this.dataChannel.bufferedAmount-=clone.byteLength;if(this.partner.open)this.partner.emit('data',clone);},1);}
 close(){for(const c of [this,this.partner]){if(!c||c.closed)continue;c.closed=true;c.open=false;c.dataChannel.readyState='closed';c.emit('close');}}
}
export class FakePeer extends Emitter{
 constructor(id){super();this.id=id;this.destroyed=false;this.disconnected=false;this.connections=[];registry.set(id,this);setTimeout(()=>this.emit('open',id),1);}
 connect(id){const receiver=registry.get(id),link='test-'+crypto.randomUUID(),a=new Connection(link,id),b=new Connection(link,this.id);a.partner=b;b.partner=a;this.connections.push(a);if(!receiver){setTimeout(()=>this.emit('error',{type:'peer-unavailable'}),5);return a;}receiver.connections.push(b);setTimeout(()=>{receiver.emit('connection',b);setTimeout(()=>{if(a.closed||b.closed)return;a.open=b.open=true;a.dataChannel.readyState=b.dataChannel.readyState='open';b.emit('open');a.emit('open');},1);},1);return a;}
 destroy(){if(this.destroyed)return;this.destroyed=true;registry.delete(this.id);this.connections.forEach(c=>c.close());this.emit('close');}
 reconnect(){this.disconnected=false;this.emit('open',this.id);}
}
