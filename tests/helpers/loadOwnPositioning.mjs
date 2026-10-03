import * as crypto from 'node:crypto';
import { loadTypeScript } from './loadTypeScript.mjs';

// Legacy route harnesses load the real new module with its closed dependency list.
// No bypass or successful fake validation is introduced.
export function loadOwnPositioning() {
 const shared=loadTypeScript('lib/daily/ownPositioning.ts');
 return loadTypeScript('lib/server/dailyOwnPositioning.ts',{'node:crypto':crypto,'@/lib/daily/ownPositioning':shared},{Buffer,File,FormData,Response});
}
