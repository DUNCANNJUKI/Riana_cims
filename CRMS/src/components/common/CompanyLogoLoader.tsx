const LOADER_LETTERS = "RIANA CIMS".split("");

export function CompanyLogoLoader({ className = "", size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
    const sizeClasses = {
        sm: "h-12 w-12 rounded-xl",
        md: "h-24 w-24 rounded-2xl",
        lg: "h-32 w-32 rounded-3xl",
    };

    return (
        <div className={`flex flex-col items-center justify-center gap-5 ${className}`}>
            <div className={`relative overflow-hidden bg-[#086f76] shadow-lg ring-1 ring-white/20 ${sizeClasses[size]}`}>
                <img
                    src="/pwa-icon.svg"
                    alt="RIANA CIMS"
                    className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 rounded-[inherit] ring-4 ring-primary/20 animate-ping" />
            </div>
            <div className="flex h-8 items-end justify-center gap-1 text-lg font-extrabold text-primary sm:text-xl" aria-label="RIANA CIMS loading">
                {LOADER_LETTERS.map((letter, index) => (
                    <span
                        key={`${letter}-${index}`}
                        className={letter === " " ? "w-2" : "inline-block animate-bounce"}
                        style={letter === " " ? undefined : { animationDelay: `${index * 80}ms`, animationDuration: "900ms" }}
                        aria-hidden="true"
                    >
                        {letter === " " ? "\u00A0" : letter}
                    </span>
                ))}
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
