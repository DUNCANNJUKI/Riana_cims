import { Skeleton } from "@/components/ui/skeleton";

export function CompanyLogoLoader({ className = "", size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
    const sizeClasses = {
        sm: "h-12 w-12",
        md: "h-24 w-24",
        lg: "h-32 w-32",
    };

    return (
        <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
            <div className={`relative ${sizeClasses[size]} animate-pulse`}>
                <img
                    src="/src/assets/riana-group-logo.jpg"
                    alt="Riana Group"
                    className="h-full w-full object-contain rounded-lg shadow-sm"
                />
                <div className="absolute inset-0 border-4 border-primary/20 rounded-lg animate-ping duration-1000" />
            </div>
            <div className="flex items-center gap-4 mt-2">
                <div className="h-3 w-3 rounded-full bg-status-approved shadow-[0_0_10px_#22c55e] animate-loader-breathe" />
                <div className="h-3 w-3 rounded-full bg-status-approved shadow-[0_0_10px_#22c55e] animate-loader-breathe [animation-delay:0.3s]" />
                <div className="h-3 w-3 rounded-full bg-status-approved shadow-[0_0_10px_#22c55e] animate-loader-breathe [animation-delay:0.6s]" />
            </div>
        </div>
    );
}

export function PageLoader() {
    return (
        <div className="flex h-[70vh] w-full items-center justify-center">
            <CompanyLogoLoader size="lg" />
        </div>
    );
}
