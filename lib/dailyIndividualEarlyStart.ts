export const DISTANCE_WITHDRAWAL_DAYS = 14;
export const INDIVIDUAL_TRAINING_WITHDRAWAL_DAYS = 10;
export const INDIVIDUAL_EARLY_START_TEXT_VERSION = "2026-09-22-v2";
export const INDIVIDUAL_FULL_PERFORMANCE_ACKNOWLEDGEMENT_TEXT =
  "Je reconnais avoir été informé(e) que cette demande ne supprime pas immédiatement mon droit de rétractation. Si la prestation est entièrement exécutée avant la fin du délai de quatorze jours, je perdrai ce droit une fois l'exécution complète, dans les conditions prévues par la loi.";

function parseDateOnly(value: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value ? date : null;
}
function formatDateOnly(value: Date) { return value.toISOString().slice(0, 10); }
function addCalendarDays(value: Date, days: number) { const result=new Date(value); result.setUTCDate(result.getUTCDate()+days); return result; }
function easterSunday(year:number){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;return new Date(Date.UTC(year,month-1,day));}
function isHoliday(value:Date){const y=value.getUTCFullYear(),d=formatDateOnly(value),fixed=new Set([`${y}-01-01`,`${y}-05-01`,`${y}-05-08`,`${y}-07-14`,`${y}-08-15`,`${y}-11-01`,`${y}-11-11`,`${y}-12-25`]),e=easterSunday(y),movable=new Set([formatDateOnly(addCalendarDays(e,1)),formatDateOnly(addCalendarDays(e,39)),formatDateOnly(addCalendarDays(e,50))]);return fixed.has(d)||movable.has(d);}
function parisDateOnly(referenceAt:string|Date){const instant=referenceAt instanceof Date?referenceAt:new Date(referenceAt);if(Number.isNaN(instant.getTime()))return null;const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(instant);const get=(t:Intl.DateTimeFormatPartTypes)=>parts.find(x=>x.type===t)?.value;return `${get("year")}-${get("month")}-${get("day")}`;}
export function calculateDistanceWithdrawalDeadline(contractSignedAt:string|Date){const ref=parseDateOnly(parisDateOnly(contractSignedAt));if(!ref)return null;let deadline=addCalendarDays(ref,DISTANCE_WITHDRAWAL_DAYS);while(deadline.getUTCDay()===0||deadline.getUTCDay()===6||isHoliday(deadline))deadline=addCalendarDays(deadline,1);return formatDateOnly(deadline);}
export function getContractEarlyStartContext(input:{recipientType:string|null;contractSignedAt:string|Date;sessionStartDate:string|null}){const contractSignedDate=parisDateOnly(input.contractSignedAt);const withdrawalDeadline=calculateDistanceWithdrawalDeadline(input.contractSignedAt);const start=parseDateOnly(input.sessionStartDate);const individual=input.recipientType==="beneficiary";const earlyStartApplicable=Boolean(individual&&start&&contractSignedDate&&withdrawalDeadline&&input.sessionStartDate!>=contractSignedDate&&input.sessionStartDate!<=withdrawalDeadline);return {individual,contractSignedDate,withdrawalDeadline,earlyStartApplicable,canonicalReference:"contract_signature" as const};}
export function individualEarlyStartRequestText(sessionStartDate:string){return `Je demande expressément que l'exécution de la formation puisse commencer le ${new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",year:"numeric",timeZone:"Europe/Paris"}).format(new Date(`${sessionStartDate}T12:00:00Z`))}, avant la fin de mon délai de rétractation si celui-ci court encore à cette date.`;}
