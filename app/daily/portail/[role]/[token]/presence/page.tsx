import DailyAttendanceWorkspace from "@/components/daily/DailyAttendanceWorkspace";

export default async function AttendancePage({params}:{params:Promise<{role:string;token:string}>}){const{role,token}=await params;return <DailyAttendanceWorkspace role={role} token={token}/>}
