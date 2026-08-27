import { refreshGoogleAccessToken } from "@/lib/server/googleOAuth";
import { zonedDateTimeToUtc } from "@/lib/server/googleCalendar";

const TIMEZONE = "Europe/Paris";
const DEFAULT_CALENDAR_ID = "crislil.redaction@gmail.com";
const DURATION_MINUTES = 60;
const STEP_MINUTES = 30;

type BusyRange = { start: string; end: string };
export type DailySetupSlot = { startsAt: string; endsAt: string; label: string };

function split(value?: string | null) { return (value ?? "").split(",").map(v => v.trim()).filter(Boolean); }
function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || DEFAULT_CALENDAR_ID;
  const timezone = process.env.GOOGLE_CALENDAR_TIMEZONE?.trim() || TIMEZONE;
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Configuration Google Calendar incomplète.");
  return { clientId, clientSecret, refreshToken, calendarId, timezone, busyIds: [...new Set([calendarId, ...split(process.env.GOOGLE_BUSY_CALENDAR_IDS)])] };
}
async function token() { const c = config(); return refreshGoogleAccessToken({ clientId:c.clientId, clientSecret:c.clientSecret, refreshToken:c.refreshToken }); }
function weekday(date:string){const[y,m,d]=date.split("-").map(Number);return new Date(Date.UTC(y,m-1,d,12)).getUTCDay()}
function windowFor(date:string){const day=weekday(date);if(day===2||day===4)return{startHour:9,startMinute:0,endHour:18,endMinute:0};if(day===3)return{startHour:9,startMinute:0,endHour:12,endMinute:30};return null}
function overlaps(a:Date,b:Date,c:Date,d:Date){return a<d&&b>c}
async function busy(timeMin:string,timeMax:string){const c=config();const access=await token();const r=await fetch("https://www.googleapis.com/calendar/v3/freeBusy",{method:"POST",headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json"},body:JSON.stringify({timeMin,timeMax,timeZone:c.timezone,items:c.busyIds.map(id=>({id}))})});const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.error?.message??"Impossible de consulter les disponibilités.");const out:BusyRange[]=[];for(const id of c.busyIds)out.push(...(data?.calendars?.[id]?.busy??[]));return out}
function fmt(value:string,tz:string){return new Intl.DateTimeFormat("fr-FR",{timeZone:tz,hour:"2-digit",minute:"2-digit"}).format(new Date(value))}
export async function getDailySetupSlots(date:string){const w=windowFor(date);if(!w)return[];const c=config();const start=zonedDateTimeToUtc(date,w.startHour,w.startMinute,c.timezone);const end=zonedDateTimeToUtc(date,w.endHour,w.endMinute,c.timezone);const busyRanges=await busy(start.toISOString(),end.toISOString());const now=new Date();const slots:DailySetupSlot[]=[];for(let cursor=new Date(start);cursor.getTime()+DURATION_MINUTES*60000<=end.getTime();cursor=new Date(cursor.getTime()+STEP_MINUTES*60000)){const s=new Date(cursor),e=new Date(cursor.getTime()+DURATION_MINUTES*60000);if(s<=now)continue;if(busyRanges.some(r=>overlaps(s,e,new Date(r.start),new Date(r.end))))continue;slots.push({startsAt:s.toISOString(),endsAt:e.toISOString(),label:`${fmt(s.toISOString(),c.timezone)} - ${fmt(e.toISOString(),c.timezone)}`})}return slots}
export async function isDailySetupSlotFree(startsAt:string,endsAt:string){const s=new Date(startsAt),e=new Date(endsAt);if(Number.isNaN(s.getTime())||Number.isNaN(e.getTime())||e.getTime()-s.getTime()!==DURATION_MINUTES*60000||s<=new Date())return false;const c=config();const date=new Intl.DateTimeFormat("en-CA",{timeZone:c.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(s);const w=windowFor(date);if(!w)return false;const ws=zonedDateTimeToUtc(date,w.startHour,w.startMinute,c.timezone),we=zonedDateTimeToUtc(date,w.endHour,w.endMinute,c.timezone);if(s<ws||e>we)return false;const ranges=await busy(startsAt,endsAt);return !ranges.some(r=>overlaps(s,e,new Date(r.start),new Date(r.end)))}
export async function createDailySetupEvent(input:{startsAt:string;endsAt:string;firstName:string;lastName:string;email:string;phone:string;message?:string}){const c=config();const access=await token();const fullName=`${input.firstName} ${input.lastName}`.trim();const r=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,{method:"POST",headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json"},body:JSON.stringify({summary:`Paramétrage Selen Daily - ${fullName}`,description:["Paramétrage accompagné Selen Daily - 1 h",`Client : ${fullName}`,`Email : ${input.email}`,`Téléphone : ${input.phone}`,"",input.message||"Aucune précision"].join("\n"),start:{dateTime:input.startsAt,timeZone:c.timezone},end:{dateTime:input.endsAt,timeZone:c.timezone},attendees:[{email:input.email}],conferenceData:{createRequest:{requestId:`selen-daily-${crypto.randomUUID()}`,conferenceSolutionKey:{type:"hangoutsMeet"}}}})});const data=await r.json().catch(()=>null);if(!r.ok||!data?.id)throw new Error(data?.error?.message??"Impossible de créer le rendez-vous.");return{eventId:data.id as string,eventUrl:data.htmlLink as string|undefined,meetUrl:data.hangoutLink as string|undefined,calendarId:c.calendarId,timezone:c.timezone}}
export async function deleteDailySetupEvent(eventId:string){const c=config();const access=await token();await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,{method:"DELETE",headers:{Authorization:`Bearer ${access}`}})}
