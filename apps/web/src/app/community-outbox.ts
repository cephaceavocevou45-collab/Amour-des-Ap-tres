export type QueuedMessage={id:string;userId:string;conversationId:string;body:string;idempotencyKey:string;replyToId?:string;createdAt:string};

const databaseName='paroisse-community-outbox';
function database():Promise<IDBDatabase>{
  if(typeof indexedDB==='undefined')return Promise.reject(new Error('Le stockage local sécurisé du navigateur est indisponible.'));
  return new Promise((resolve,reject)=>{const request=indexedDB.open(databaseName,1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('messages'))db.createObjectStore('messages',{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error??new Error('Ouverture du stockage impossible.'));});
}
export async function saveQueuedMessage(message:QueuedMessage){const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('messages','readwrite');tx.objectStore('messages').put(message);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export async function queuedMessages(userId:string):Promise<QueuedMessage[]>{const db=await database();try{return await new Promise((resolve,reject)=>{const request=db.transaction('messages','readonly').objectStore('messages').getAll();request.onsuccess=()=>resolve((request.result as QueuedMessage[]).filter(item=>item.userId===userId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)));request.onerror=()=>reject(request.error);});}finally{db.close();}}
export async function removeQueuedMessage(id:string){const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('messages','readwrite');tx.objectStore('messages').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
