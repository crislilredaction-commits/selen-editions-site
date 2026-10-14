import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

type Template = { id:string; template_version:number; storage_path:string; template_name:string };
const escape = (value:string)=>value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");

/** Reuse the OF's private model; an unfilled model can never be validated. */
export async function renderDailyPretrainingTemplate(args:{admin:any;organisationId:string;template?:Template;variables:Record<string,string>;html:string}) {
  if(!args.template)return{bytes:new TextEncoder().encode(args.html),mimeType:"application/msword",extension:"doc",metadata:{}};
  const template=args.template;
  if(!template.storage_path?.startsWith(`daily/${args.organisationId}/templates/`))throw new Error("Modèle hors du périmètre de l’organisme.");
  const {data,error}=await args.admin.storage.from("documents").download(template.storage_path);
  if(error||!data)throw new Error("Le modèle personnalisé de l’organisme est indisponible.");
  const bytes=Buffer.from(await data.arrayBuffer());
  if(!bytes.length||bytes.length>10*1024*1024)throw new Error("Modèle personnalisé invalide ou trop volumineux.");
  const missing=new Set<string>();
  const metadata={template_id:template.id,template_version:template.template_version,template_name:template.template_name,template_source:"CLIENT"};
  if(bytes[0]===0x50&&bytes[1]===0x4b){
    try{
      const doc=new Docxtemplater(new PizZip(bytes),{paragraphLoop:true,linebreaks:true,errorLogging:false,delimiters:{start:"{{",end:"}}"},nullGetter:part=>{missing.add(part.value);return`{{${part.value}}}`;}});
      doc.render(args.variables);
      return{bytes:new Uint8Array(doc.getZip().generate({type:"nodebuffer"})),mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",extension:"docx",metadata:{...metadata,requires_template_completion:missing.size>0,missing_template_variables:[...missing]}};
    }catch{throw new Error("Le modèle Word personnalisé ne peut pas être rempli. Vérifiez ses champs entre doubles accolades.");}
  }
  if(bytes.subarray(0,5).toString()==="%PDF-")return{bytes:new Uint8Array(bytes),mimeType:"application/pdf",extension:"pdf",metadata:{...metadata,requires_template_completion:true}};
  const html=bytes.toString("utf8");
  if(!/<(?:!doctype|html|body)\b/i.test(html))return{bytes:new Uint8Array(bytes),mimeType:"application/msword",extension:"doc",metadata:{...metadata,requires_template_completion:true}};
  const filled=html.replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(match,key)=>{if(!Object.hasOwn(args.variables,key)){missing.add(key);return match;}return escape(args.variables[key]);});
  return{bytes:new TextEncoder().encode(filled),mimeType:"application/msword",extension:"doc",metadata:{...metadata,requires_template_completion:missing.size>0,missing_template_variables:[...missing]}};
}
