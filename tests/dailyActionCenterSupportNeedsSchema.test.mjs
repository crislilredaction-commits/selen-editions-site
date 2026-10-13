import test from 'node:test';import assert from 'node:assert/strict';
import {exchangeHarness,ids} from './helpers/dailyTrainerExchangeHarness.mjs';
test('le centre d’actions utilise la vraie clé des besoins et conserve les candidatures',async()=>{
 const h=exchangeHarness({assisted:false,supportNeedsSchema:true});h.context.user=h.workspace.user;
 for(const name of ['daily_session_checklist_items','daily_enrolment_support_needs','daily_onboarding','daily_business_watch_entries','daily_quality_actions','daily_formation_registration_requests','client_reminders','daily_trainer_annual_reviews'])h.db[name]=[];
 h.db.organisations[0].qualiopi_status='no';h.db.daily_trainer_profiles=[];
 h.db.daily_formation_registration_requests=[{id:ids.trainer,decision_status:'ready_for_of',submitted_at:'2026-10-13T10:00Z',respondent_first_name:'Alice',daily_formations:{title:'Formation exemple',organisation_id:ids.org}}];
 h.db.daily_enrolment_support_needs=[{enrolment_id:'enrolment',organisation_id:ids.org,has_specific_needs:true,contact_requested:true,daily_session_enrolments:{...h.enrolment,daily_sessions:h.session}}];
 const route=h.load('app/api/client/daily/action-center/route.ts',{
  '@/lib/server/dailySessionCompletion':h.load('lib/server/dailySessionCompletion.ts',{'@/lib/server/dailyCurrentPositioningEvidence':{filterCurrentOwnPositioningEvidence(){throw Error('Unexpected completion write path');}}}),
  '@/lib/server/dailyOrganisationContext':{getDailyOrganisationReadContext:async()=>h.context,getDailyOrganisationBillingUserId:async()=>h.workspace.user.id},
 });
 const r=await route.GET(new Request('https://site.test/api/client/daily/action-center')),body=await r.json();assert.equal(r.status,200,body.error);
 assert.ok(body.actions.some(a=>a.id===`registration-request:${ids.trainer}`));assert.ok(body.actions.some(a=>a.id==='adaptation:enrolment'));
 assert.ok(h.reads.find(r=>r.table==='daily_enrolment_support_needs').columns.startsWith('enrolment_id,'));
});
