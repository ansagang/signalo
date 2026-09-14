import { toast } from "sonner";
import { CheckCircle2Icon, CircleAlert, CircleCheck, CircleX, Info, X } from "lucide-react";

function ToastContent({ icon, message, t }) {
  return (
    <div className="flex items-center gap-5 w-full relative z-10">
      {icon}
      <span className="flex-1">{message}</span>
      {/* <button onClick={() => toast.dismiss(t)} className="shrink-0 cursor-pointer hover:text-fg transition-colors">
        <X className="size-4" />
      </button> */}
    </div>
  );
}

export function showError(message) {
  toast.custom((t) => (
    <div className="flex w-80 rounded-button px-4 py-3.5 border text-sm font-medium bg-primary relative overflow-hidden before:absolute before:inset-0 before:via-transparent before:bg-linear-to-r before:from-error/20 before:to-transparent before:pointer-events-none border-error/40 text-fg">
      <ToastContent icon={<CircleX className=" text-error shrink-0" />} message={message} t={t} />
    </div>
  ));
}

export function showSuccess(message) {
  toast.custom((t) => (
   <div className="flex w-80 rounded-button px-4 py-3.5 border text-sm font-medium bg-primary relative overflow-hidden before:absolute before:inset-0 before:via-transparent before:bg-linear-to-r before:from-success/20 before:to-transparent before:pointer-events-none border-success/40 text-fg">
      <ToastContent icon={<CheckCircle2Icon className=" text-success shrink-0" />} message={message} t={t} />
    </div>
  ));
}

export function showWarning(message) {
  toast.custom((t) => (
    <div className="flex w-full min-w-[300px] max-w-[400px] rounded-button px-4 py-3.5 border text-sm font-medium bg-warning-dim border-warning/30 text-fg">
      <ToastContent icon={CircleAlert} message={message} t={t} />
    </div>
  ));
}

export function showInfo(message) {
  toast.custom((t) => (
    <div className="flex w-full min-w-[300px] max-w-[400px] rounded-button px-4 py-3.5 border text-sm font-medium bg-info-dim border-info/30 text-fg">
      <ToastContent icon={Info} message={message} t={t} />
    </div>
  ));
}
