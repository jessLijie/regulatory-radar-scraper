/// <reference types="vite/client" />
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { normalize } from "./model";

export async function sha256(value: ArrayBuffer | string) {
  const bytes=typeof value==="string"?new TextEncoder().encode(value):value;
  const digest=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
export async function readPolicy(file: File) {
  if(file.size>5*1024*1024)throw new Error("Choose a policy smaller than 5 MB.");
  const data=await file.arrayBuffer();const rawHash=await sha256(data);let text="";
  if(/\.pdf$/i.test(file.name)) {
    const pdfjs=await import("pdfjs-dist");pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
    const task=pdfjs.getDocument({data:new Uint8Array(data),useSystemFonts:true});
    try{const pdf=await task.promise;if(pdf.numPages>60)throw new Error("Choose a policy of 60 pages or fewer.");
      for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const content=await page.getTextContent();text+=`\n[Page ${i}]\n`;for(const item of content.items)if("str" in item)text+=item.str+(item.hasEOL?"\n":" ");text+="\n";page.cleanup();}
    }finally{await task.destroy();}
  } else if(/\.(txt|md)$/i.test(file.name)){text=new TextDecoder().decode(data);}else throw new Error("Supported policy files: PDF, TXT and Markdown.");
  if(!normalize(text.replace(/\[Page \d+\]/g," ")))throw new Error("No readable text found. Scanned PDFs need OCR; try a text-based PDF or TXT file.");
  return {text,rawHash,textHash:await sha256(normalize(text.replace(/\[Page \d+\]/g," ")))};
}
