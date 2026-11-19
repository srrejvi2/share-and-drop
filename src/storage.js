import {MEMORY_LIMIT,safeName} from './protocol.js';
export async function createSink(meta,{picker=false}={}){
 let writable,handle,dir,tempName,parts=[];
 if(picker&&window.showSaveFilePicker){try{handle=await window.showSaveFilePicker({suggestedName:safeName(meta.name)});writable=await handle.createWritable();}catch(err){if(err.name==='AbortError')throw err;picker=false;handle=null;}}
 if(!writable&&navigator.storage?.getDirectory){
  try{const estimate=await navigator.storage.estimate();if(estimate.quota&&estimate.usage+meta.size>estimate.quota*.9)throw Error('Not enough browser storage. Free space or use a browser with Save to disk.');dir=await navigator.storage.getDirectory();tempName=`share-drop-${Date.now()}-${crypto.randomUUID()}`;handle=await dir.getFileHandle(tempName,{create:true});writable=await handle.createWritable();}catch(err){if(meta.size>MEMORY_LIMIT)throw err;dir=null;writable=null;}
 }
 if(!writable&&meta.size>MEMORY_LIMIT)throw Error('This browser supports files up to 128 MB in memory. Use desktop Chrome or Edge for larger files.');
 let url=null,finished=false;
 return {
  mode:picker&&window.showSaveFilePicker?'disk':writable?'browser disk':'memory',
  async write(data){if(writable)await writable.write(data);else parts.push(data.slice());},
  async finish(){if(writable)await writable.close();finished=true;if(picker&&window.showSaveFilePicker)return {saved:true};const blob=handle?await handle.getFile():new Blob(parts,{type:meta.type||'application/octet-stream'});parts=[];url=URL.createObjectURL(blob);return {url,name:safeName(meta.name)};},
  async dispose(){if(writable&&!finished)await writable.abort().catch(()=>{});parts=[];if(url)URL.revokeObjectURL(url);if(dir&&tempName)await dir.removeEntry(tempName).catch(()=>{});}
 };
}
export async function cleanOldTemps(){if(!navigator.storage?.getDirectory)return;try{const dir=await navigator.storage.getDirectory();for await(const [name] of dir.entries()){const m=/^share-drop-(\d+)-/.exec(name);if(m&&Date.now()-Number(m[1])>24*60*60*1000)await dir.removeEntry(name).catch(()=>{});}}catch{}}
