import { useState } from 'react';
import {
  Users as UsersIcon,
  Search,
  Plus,
  Edit,
  Shield,
  Mail,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUsersWithRoles, useCreateProfile, useUpdateProfile, useCreateUserRole, useUpdateUserRole, useDeleteProfile } from '@/hooks/useSupabaseData';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Trash2,
  Ban,
  CheckCircle2,
  MoreHorizontal
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const roleColors: Record<string, string> = {
  admin: 'bg-primary/10 text-primary border-primary/20',
  senior_developer: 'bg-status-in-progress/10 text-status-in-progress border-status-in-progress/20',
  developer: 'bg-status-approved/10 text-status-approved border-status-approved/20',
  sales: 'bg-status-pending/10 text-status-pending border-status-pending/20',
};

const roleLabels: Record<string, string> = {
  admin: 'Administrator',
  senior_developer: 'Senior Developer',
  developer: 'Developer',
  sales: 'Sales Team',
};

export default function Users() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    department: '',
    role: 'developer' as 'admin' | 'senior_developer' | 'developer' | 'sales',
    password: '',
  });

  const { data: users, isLoading, error } = useUsersWithRoles();
  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile();
  const createUserRole = useCreateUserRole();
  const updateUserRole = useUpdateUserRole();
  const deleteProfile = useDeleteProfile();
  const { toast } = useToast();

  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const filteredUsers = users?.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.department?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleOpenAdd = () => {
    setFormData({ name: '', email: '', department: '', role: 'developer', password: '' });
    setEditingUser(null);
    setIsAddDialogOpen(true);
  };

  const handleOpenEdit = (user: any) => {
    setFormData({
      name: user.name,
      email: user.email,
      department: user.department || '',
      role: user.roles[0]?.role || 'developer',
      password: '',
    });
    setEditingUser(user);
    setIsAddDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      if (editingUser) {
        await updateProfile.mutateAsync({
          id: editingUser.id,
          name: formData.name,
          department: formData.department,
        });

        if (editingUser.roles[0] && editingUser.roles[0].role !== formData.role) {
          await updateUserRole.mutateAsync({
            id: editingUser.roles[0].id,
            role: formData.role,
          });
        }

        if (formData.password) {
          await updateProfile.mutateAsync({
            id: editingUser.id,
            password: formData.password,
          });
        }

        toast({
          title: 'User Updated',
          description: `${formData.name} has been updated successfully.`,
        });
      } else {
        const profile = await createProfile.mutateAsync({
          name: formData.name,
          email: formData.email,
          password: formData.password || undefined,
          department: formData.department,
        });

        await createUserRole.mutateAsync({
          user_id: profile.id,
          role: formData.role,
        });

        toast({
          title: 'User Created',
          description: `${formData.name} has been added successfully.`,
        });
      }

      setIsAddDialogOpen(false);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to save user',
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (user: any) => {
    try {
      const newStatus = user.status === 'active' ? 'suspended' : 'active';
      await updateProfile.mutateAsync({
        id: user.id,
        status: newStatus,
      } as any);

      toast({
        title: `User ${newStatus === 'active' ? 'Reactivated' : 'Suspended'}`,
        description: `${user.name} is now ${newStatus}.`,
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to update status',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      await deleteProfile.mutateAsync(userToDelete.id);
      setIsDeleteDialogOpen(false);
      setUserToDelete(null);
      toast({
        title: 'User Deleted',
        description: 'The user has been successfully removed.',
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to delete user',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UsersIcon className="h-6 w-6" />
              Users
            </h1>
            <p className="text-muted-foreground">Manage system users and roles</p>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">Error loading users</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground">
            <UsersIcon className="h-6 w-6 text-primary" />
            Users
          </h1>
          <p className="text-muted-foreground">
            Manage system users and their roles
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenAdd} className="bg-primary hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
              <DialogDescription>
                {editingUser ? 'Update user information and role' : 'Create a new user account'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="john@company.com"
                  disabled={!!editingUser}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  value={formData.department}
                  onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                  placeholder="Engineering"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: any) => setFormData(prev => ({ ...prev, role: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="senior_developer">Senior Developer</SelectItem>
                    <SelectItem value="developer">Developer</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{editingUser ? 'Change Password (optional)' : 'Password'}</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder={editingUser ? "Leave blank to keep current" : "Set initial password"}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!formData.name || !formData.email || createProfile.isPending || updateProfile.isPending}
              >
                {editingUser ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-primary/10 p-3">
                <UsersIcon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{users?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-status-approved/10 p-3">
                <Shield className="h-6 w-6 text-status-approved" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {users?.filter(u => u.roles.some(r => r.role === 'admin')).length || 0}
                </p>
                <p className="text-sm text-muted-foreground">Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-status-in-progress/10 p-3">
                <Building2 className="h-6 w-6 text-status-in-progress" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {users?.filter(u => u.roles.some(r => r.role === 'developer' || r.role === 'senior_developer')).length || 0}
                </p>
                <p className="text-sm text-muted-foreground">Developers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-status-pending/10 p-3">
                <Mail className="h-6 w-6 text-status-pending" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {users?.filter(u => u.roles.some(r => r.role === 'sales')).length || 0}
                </p>
                <p className="text-sm text-muted-foreground">Sales</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {user.name ? user.name.split(' ').map(n => n[0]).join('') : 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>{user.department || '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {user.roles.map((role) => (
                        <Badge
                          key={role.id}
                          variant="outline"
                          className={roleColors[role.role]}
                        >
                          {roleLabels[role.role]}
                        </Badge>
                      ))}
                      {user.roles.length === 0 && (
                        <Badge variant="outline" className="text-muted-foreground">
                          No Role
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={user.status === 'suspended' ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-status-approved/10 text-status-approved border-status-approved/20"}
                    >
                      {user.status === 'active' ? 'Active' : 'Suspended'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleOpenEdit(user)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                          {user.status === 'active' ? (
                            <>
                              <Ban className="mr-2 h-4 w-4" />
                              Suspend User
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Reactivate User
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            setUserToDelete(user);
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete User
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <UsersIcon className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">No users found</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the user account
              for <span className="font-semibold text-foreground">{userToDelete?.name}</span> and remove their data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
