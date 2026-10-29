import {useEffect,useState,useRef} from "react";
import {useQuery,useMutation,useQueryClient} from "@tanstack/react-query";
import {useAuth} from "@/hooks/use-auth";
import {apiRequest} from "@/lib/queryClient";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

interface Asset {id:string;path:string;alt:string;source:string;bytes:number}
interface Job {id:string;kind:string;status:string;prompt:string}
export function ProjectImageAssets({conversationId}:{conversationId:number|null}) {
  const {user}=useAuth(),client=useQueryClient();
  const [open,setOpen]=useState(false),[source,setSource]=useState("upload"),[query,setQuery]=useState("");
  const [section,setSection]=useState("hero"),[jobId,setJobId]=useState(""),[message,setMessage]=useState("");
  const url=`/api/conversations/${conversationId}/website-assets`;
  const key=["website-assets",user?.id,conversationId];
  const scope=useRef("");scope.current=`${user?.id}:${conversationId}`;
  useEffect(()=>{setOpen(false);setQuery("");setJobId("");setMessage("");},[user?.id,conversationId]);
  const assets=useQuery<{assets:Asset[]}>({queryKey:key,enabled:Boolean(open&&user&&conversationId),
    queryFn:async()=>{const r=await apiRequest("GET",url);return r.json();},staleTime:0});
  const jobs=useQuery<{jobs:Job[]}>({queryKey:["website-image-jobs",user?.id,conversationId],
    enabled:Boolean(open&&source==="generated"&&user&&conversationId),
    queryFn:async()=>{const r=await apiRequest("GET","/api/media/jobs");return r.json();},staleTime:0});
  const add=useMutation({
    mutationFn:async(body:unknown)=>{const target=scope.current;const r=await apiRequest("POST",url,body);return {target,result:await r.json()};},
    onSuccess:async({target,result})=>{
      if(target!==scope.current)return;
      setMessage(result.asset||result.assets?.length?"Saved permanently to this project’s Files. Other generated media still expires normally.":result.message||"No suitable image found.");
      await client.invalidateQueries({queryKey:key});
      await client.invalidateQueries({queryKey:["/api/project-files",conversationId]});
      await client.invalidateQueries({queryKey:["/api/files",conversationId]});
      await client.invalidateQueries({predicate:q=>q.queryKey.includes(conversationId)&&q.queryKey.some(v=>typeof v==="string"&&v.includes("files"))});
    },
    onError:error=>setMessage(error instanceof Error?error.message:"Image could not be saved."),
  });
  const remove=useMutation({mutationFn:async(id:string)=>{await apiRequest("DELETE",`${url}/${id}`);},
    onSuccess:async()=>{setMessage("Removed the private project image. Published copies are unchanged.");await client.invalidateQueries({queryKey:key});await client.invalidateQueries({predicate:q=>q.queryKey.includes(conversationId)&&q.queryKey.some(v=>typeof v==="string"&&v.includes("files"))});},
    onError:error=>setMessage(error instanceof Error?error.message:"Image could not be removed."),
  });
  async function upload(file:File|undefined) {
    if(!file)return;
    if(file.size>8*1024*1024||!["image/png","image/jpeg","image/webp"].includes(file.type)){setMessage("Choose a PNG, JPEG or WebP image up to 8 MB.");return;}
    const reader=new FileReader();
    const target=scope.current;
    reader.onerror=()=>setMessage("The image file could not be read.");
    reader.onload=()=>{if(target===scope.current)add.mutate({base64:String(reader.result).split(",")[1],alt:file.name,section});};
    reader.readAsDataURL(file);
  }
  if(!user||!conversationId)return null;
  return <div className="border-b p-2 text-xs">
    <button className="font-medium underline underline-offset-2" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>Project images</button>
    {open&&<div className="mt-2 space-y-2">
      <p className="text-muted-foreground">Private to this project and its owner. Selected images are kept permanently; publishing creates a public website copy.</p>
      <label className="block">Image source
        <select aria-label="Image source" value={source} onChange={e=>{setSource(e.target.value);setMessage("");}} className="w-full rounded border bg-background p-1">
          <option value="upload">Upload image</option><option value="stock">Find licensed photograph</option><option value="generated">Keep an existing generated image</option>
        </select>
      </label>
      <label className="block">Section
        <select aria-label="Image section" value={section} onChange={e=>setSection(e.target.value)} className="w-full rounded border bg-background p-1">
          {["hero","about","services","gallery","custom"].map(s=><option key={s}>{s}</option>)}
        </select>
      </label>
      {source==="upload"&&<input aria-label="Upload permanent project image" type="file" accept="image/png,image/jpeg,image/webp" disabled={add.isPending} onChange={e=>{void upload(e.target.files?.[0]);e.target.value="";}} className="w-full"/>}
      {source==="stock"&&<>
        <Input aria-label="Public photo subject" value={query} onChange={e=>setQuery(e.target.value)} placeholder="e.g. gym equipment" maxLength={120}/>
        <p className="text-muted-foreground">Public subject only; do not enter private business details. Photographs are illustrative.</p>
        <Button size="sm" disabled={add.isPending||query.trim().length<2} onClick={()=>add.mutate({query:query.trim(),section})}>Find and save</Button>
      </>}
      {source==="generated"&&<>
        <select aria-label="Completed generated image" value={jobId} onChange={e=>setJobId(e.target.value)} className="w-full rounded border bg-background p-1">
          <option value="">Choose your completed image</option>
          {jobs.data?.jobs.filter(j=>j.kind==="image"&&j.status==="succeeded").map(j=><option key={j.id} value={j.id}>{j.prompt.slice(0,65)}</option>)}
        </select>
        <p className="text-muted-foreground">Copies an unexpired image you already generated. No new paid generation starts here. Create new images in Media after reviewing the credit cost.</p>
        <Button size="sm" disabled={add.isPending||!jobId} onClick={()=>add.mutate({mediaJobId:jobId,section})}>Keep on this website</Button>
      </>}
      {add.isPending&&<p role="status">Saving project image…</p>}
      {(message||assets.error||jobs.error)&&<p role="status" className="break-words">{message||(assets.error||jobs.error)?.message}</p>}
      <ul className="space-y-2">{assets.data?.assets.map(a=><li key={a.id} className="rounded border p-2">
        <p className="break-words">{a.alt}</p><p className="break-all text-muted-foreground">{a.path}</p>
        <p>{a.source} · {Math.ceil(a.bytes/1024)} KB · permanent</p>
        <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={()=>{if(window.confirm("Remove this image from the private project? Existing published copies will not be changed."))remove.mutate(a.id);}}>Remove</Button>
      </li>)}</ul>
    </div>}
  </div>;
}
