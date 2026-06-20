import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { CompanyLogoLoader } from "@/components/common/CompanyLogoLoader";
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { LogIn, ShieldCheck } from 'lucide-react';
import logoImage from '@/assets/riana-group-logo.jpg';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [challengeId, setChallengeId] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [verificationHint, setVerificationHint] = useState('');
    const navigate = useNavigate();
    const { toast } = useToast();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const res = await fetch(challengeId ? '/api/crms/auth/verify-2fa' : '/api/crms/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(challengeId
                    ? { challengeId, code: verificationCode }
                    : { email, password }),
            });

            const data = await res.json();

            if (res.ok && data.requiresTwoFactor) {
                setChallengeId(data.challengeId);
                setVerificationHint(`${data.method.toUpperCase()} code sent to ${data.destination}`);
                if (data.developmentCode) setVerificationCode(data.developmentCode);
                toast({ title: 'Verification required', description: `${data.method.toUpperCase()} verification code sent.` });
            } else if (res.ok && data.success) {
                localStorage.setItem('crms-user-session', 'active');
                localStorage.setItem('crms-user-id', data.user.id);
                localStorage.setItem('crms-auth-token', data.token);
                toast({
                    title: 'Welcome back!',
                    description: `Successfully signed in as ${data.user.name}`,
                });
                navigate('/');
            } else {
                toast({
                    title: 'Login failed',
                    description: data.error || 'Invalid email or password.',
                    variant: 'destructive',
                });
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to connect to the server.',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/50 to-background p-4">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
                <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
            </div>

            <Card className="w-full max-w-md border-border/40 bg-card/80 backdrop-blur-xl shadow-2xl relative z-10 transition-all duration-500 animate-in fade-in zoom-in slide-in-from-bottom-32">
                <CardHeader className="space-y-4 pb-8">
                    <div className="mx-auto w-16 h-16 rounded-xl overflow-hidden shadow-lg ring-2 ring-primary/20 bg-white p-1">
                        <img src={logoImage} alt="Riana Group" className="w-full h-full object-contain" />
                    </div>
                    <div className="text-center space-y-2">
                        <CardTitle className="text-3xl font-bold tracking-tight">CRMS Portal</CardTitle>
                        <CardDescription className="text-base text-muted-foreground">
                            Sign in to manage change requests and workflows
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Email Address
                            </label>
                            <Input
                                type="email"
                                placeholder="name@company.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="h-12 bg-muted/30 border-border/50 focus:border-primary/50 transition-colors"
                                required
                            />
                        </div>
                        {challengeId && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Verification code</label>
                                <Input
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                                    placeholder="Enter 6-digit code"
                                    className="h-12 tracking-[0.35em] text-center"
                                    required
                                />
                                <p className="text-xs text-muted-foreground">{verificationHint}</p>
                            </div>
                        )}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    Password
                                </label>
                                <a href="#" className="text-xs text-primary hover:underline transition-all">
                                    Forgot password?
                                </a>
                            </div>
                            <Input
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="h-12 bg-muted/30 border-border/50 focus:border-primary/50 transition-colors"
                                required
                            />
                        </div>
                        <Button
                            type="submit"
                            className="w-full h-12 text-base font-semibold transition-all duration-300 active:scale-[0.98]"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <div className="flex items-center gap-2">
                                    <CompanyLogoLoader size="sm" className="h-4 w-4" />
                                    Signing in...
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <LogIn className="w-4 h-4" />
                                {challengeId ? 'Verify & Sign In' : 'Sign In'}
                                </div>
                            )}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="flex flex-col space-y-4 pt-4 pb-8 border-t border-border/30 mt-6">
                    <p className="text-xs text-center text-muted-foreground">
                        © {new Date().getFullYear()} Riana Group. All rights reserved.
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}
