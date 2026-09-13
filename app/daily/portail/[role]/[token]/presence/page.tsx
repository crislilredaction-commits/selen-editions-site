import DailyAttendanceWorkspace from "@/components/daily/DailyAttendanceWorkspace";
import LateAttendancePrompt from "@/components/daily/LateAttendancePrompt";

export default async function AttendancePage({params}:{params:Promise<{role:string;token:string}>}){
  const{role,token}=await params;
  return <><DailyAttendanceWorkspace role={role} token={token}/><LateAttendancePrompt role={role} token={token}/></>;
}
