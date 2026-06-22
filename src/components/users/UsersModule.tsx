import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Users, Mail, Phone, Shield, Calendar, Loader2, Edit, CheckCircle, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDatabase } from "@/hooks/useDatabase";
import { User } from "@/types";
import { apiClient } from "@/integrations/apiClient";

interface UsersModuleProps {
  user: User;
}

export const UsersModule = ({ user }: UsersModuleProps) => {
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordChangeUser, setPasswordChangeUser] = useState<User | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [newUser, setNewUser] = useState<Partial<User>>({});
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [subsidiaries, setSubsidiaries] = useState<any[]>([]);
  const { toast } = useToast();
  const { 
    getUsers, 
    createUser,
    updateUser,
    deleteUser,
    adminChangePassword, 
    getDepartments, 
    getSubsidiaries, 
    loading 
  } = useDatabase();
  const isSuperAdmin = user.role === 'SuperAdmin';
  const canManageUsers = isSuperAdmin || user.role === 'Admin';
  const privilegedRoles = new Set<User['role']>(['SuperAdmin', 'Admin']);
  const canManageTarget = (targetUser: User) => isSuperAdmin || !privilegedRoles.has(targetUser.role);
  const canDeleteTarget = (targetUser: User) => isSuperAdmin && targetUser.id !== user.id;
  const assignableRoles: User['role'][] = isSuperAdmin
    ? ['SuperAdmin', 'Admin', 'Developer', 'Sales', 'Teamlead', 'User']
    : ['Developer', 'Sales', 'Teamlead', 'User'];
  const crmsAssignableRoles: Exclude<User['role'], 'User'>[] = ['SuperAdmin', 'Admin', 'Developer', 'Sales', 'Teamlead'];

  useEffect(() => {
    loadInitialData();
  }, []);


  const loadInitialData = async () => {
    try {
      const [usersData, departmentsData, subsidiariesData] = await Promise.all([
        getUsers(),
        getDepartments(),
        getSubsidiaries()
      ]);
      
      setUsers(usersData);
      setDepartments(departmentsData);
      setSubsidiaries(subsidiariesData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive",
      });
    }
  };

  if (!canManageUsers) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Access denied. Admin or SuperAdmin privileges required.</p>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.role || !newUser.designation || !newUser.first_name || !newUser.last_name || !newUser.password) {
      toast({
        title: "Error",
        description: "Please fill in all required fields (first name, last name, email, password, role, designation)",
        variant: "destructive",
      });
      return;
    }
    if (!/^[^\s@]+@riana\.co$/i.test(newUser.email)) {
      toast({ title: "Invalid email", description: "New users must use an @riana.co email address.", variant: "destructive" });
      return;
    }
    if (newUser.password.length < 8) {
      toast({ title: "Weak password", description: "Temporary passwords must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (!assignableRoles.includes(newUser.role as User['role'])) {
      toast({
        title: "Role not allowed",
        description: "Only SuperAdmin can create SuperAdmin/Admin accounts.",
        variant: "destructive",
      });
      return;
    }

    try {
      const userData = {
        email: newUser.email!,
        password: newUser.password!,
        role: newUser.role! as User['role'],
        designation: newUser.designation!,
        department_id: newUser.department_id || null,
        subsidiary_id: newUser.subsidiary_id || null,
        phone_number: newUser.phone_number || '',
        first_name: newUser.first_name!,
        last_name: newUser.last_name!
      };

      await createUser(userData);
      await loadInitialData(); // Refresh the user list
      setNewUser({});
      setIsAddDialogOpen(false);
      toast({
        title: "Success",
        description: `User ${newUser.first_name} ${newUser.last_name} added successfully.`,
      });
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create user. Please check your configuration.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = async (targetUser: User) => {
    if (!canDeleteTarget(targetUser)) {
      toast({
        title: "Action not allowed",
        description: targetUser.id === user.id ? "You cannot delete your own account." : "Only SuperAdmin can delete users.",
        variant: "destructive",
      });
      return;
    }

    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      await deleteUser(targetUser.id);
      await loadInitialData();
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const handleResetPassword = async (targetUser: User) => {
    if (!canManageTarget(targetUser)) {
      toast({ title: "Action not allowed", description: "Only SuperAdmin can reset SuperAdmin/Admin accounts.", variant: "destructive" });
      return;
    }
    try {
      await apiClient.post('/auth/forgot-password', { email: targetUser.email });
      toast({
        title: "Password reset sent",
        description: `A secure reset link was sent to ${targetUser.email}.`,
      });
    } catch (error) {
      toast({
        title: "Reset failed",
        description: error instanceof Error ? error.message : 'Could not send the password reset link.',
        variant: "destructive",
      });
    }
  };

  // Admin change user password directly
  const handleAdminChangePassword = async (targetUser: User, newPassword: string) => {
    if (!canManageTarget(targetUser)) {
      toast({ title: "Action not allowed", description: "Only SuperAdmin can change SuperAdmin/Admin passwords.", variant: "destructive" });
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      toast({
        title: "Error",
        description: "Password must be at least 8 characters long",
        variant: "destructive",
      });
      return;
    }

    try {
      await adminChangePassword(targetUser.id, newPassword);
      
      setIsPasswordDialogOpen(false);
      setNewPasswordValue('');
      setPasswordChangeUser(null);
    } catch (error: any) {
      console.error('Error changing password:', error);
    }
  };

  const handleEditUser = (targetUser: User) => {
    if (!canManageTarget(targetUser)) {
      toast({ title: "Action not allowed", description: "Only SuperAdmin can edit SuperAdmin/Admin accounts.", variant: "destructive" });
      return;
    }
    setEditingUser(targetUser);
    setIsEditDialogOpen(true);
  };

  const handleSaveEditUser = async () => {
    if (!editingUser) return;

    try {
      await updateUser(editingUser.id, {
        first_name: editingUser.first_name,
        last_name: editingUser.last_name,
        email: editingUser.email,
        phone_number: editingUser.phone_number,
        ...(isSuperAdmin ? { role: editingUser.role } : {}),
        ...(isSuperAdmin ? { module_roles: editingUser.module_roles || {} } : {}),
      });

      await loadInitialData();
      setIsEditDialogOpen(false);
      setEditingUser(null);
    } catch (error: any) {
      console.error('Error updating user:', error);
    }
  };


  const getRoleColor = (role: string) => {
    switch (role) {
      case 'SuperAdmin': return 'bg-purple-600 text-white';
      case 'Admin': return 'bg-red-500 text-white';
      case 'Developer': return 'bg-violet-500 text-white';
      case 'Sales': return 'bg-amber-500 text-white';
      case 'Teamlead': return 'bg-blue-500 text-white';
      case 'User': return 'bg-emerald-500 text-white';
      default: return 'bg-muted';
    }
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  const roleStats = {
    superadmin: users.filter(u => u.role === 'SuperAdmin').length,
    admin: users.filter(u => u.role === 'Admin').length,
    developer: users.filter(u => u.role === 'Developer').length,
    teamlead: users.filter(u => u.role === 'Teamlead').length,
    user: users.filter(u => u.role === 'User').length,
    pending: users.filter(u => u.first_login).length
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Users Management</h1>
          <p className="text-muted-foreground">Manage system users and access controls</p>
        </div>
        {canManageUsers && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription>
                  Create a new user account with system access
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name *</Label>
                    <Input
                      id="first_name"
                      value={newUser.first_name || ''}
                      onChange={(e) => setNewUser({...newUser, first_name: e.target.value})}
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last Name *</Label>
                    <Input
                      id="last_name"
                      value={newUser.last_name || ''}
                      onChange={(e) => setNewUser({...newUser, last_name: e.target.value})}
                      placeholder="Doe"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newUser.email || ''}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    placeholder="user@riana.co"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={newUser.password || ''}
                    onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                    placeholder="Password (user will change on first login)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role *</Label>
                  <Select value={newUser.role || ''} onValueChange={(value) => setNewUser({...newUser, role: value as User['role']})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select user role" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role === 'Teamlead' ? 'Team Lead' : role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                   <Label htmlFor="designation">Designation *</Label>
                   <Select value={newUser.designation || ''} onValueChange={(value) => setNewUser({...newUser, designation: value as User['designation']})}>
                     <SelectTrigger>
                       <SelectValue placeholder="Select user designation" />
                     </SelectTrigger>
                     <SelectContent>
                       {isSuperAdmin && <SelectItem value="SuperAdmin">SuperAdmin</SelectItem>}
                       <SelectItem value="Admin">Admin</SelectItem>
                       <SelectItem value="Developer">Developer</SelectItem>
                       <SelectItem value="Teamlead">Teamlead</SelectItem>
                       <SelectItem value="Sales">Sales</SelectItem>
                       <SelectItem value="Field specialist">Field specialist</SelectItem>
                       <SelectItem value="Product Specialist">Product Specialist</SelectItem>
                       <SelectItem value="Customer success">Customer success</SelectItem>
                       <SelectItem value="Intern">Intern</SelectItem>
                       <SelectItem value="Manager">Manager</SelectItem>
                       <SelectItem value="Support">Support</SelectItem>
                       <SelectItem value="Hardware Engineer">Hardware Engineer</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
                <div className="space-y-2">
                  <Label htmlFor="phone_number">Phone Number</Label>
                  <Input
                    id="phone_number"
                    value={newUser.phone_number || ''}
                    onChange={(e) => setNewUser({...newUser, phone_number: e.target.value})}
                    placeholder="+254700000000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subsidiary_id">Subsidiary</Label>
                  <Select value={newUser.subsidiary_id || ''} onValueChange={(value) => setNewUser({...newUser, subsidiary_id: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select subsidiary" />
                    </SelectTrigger>
                    <SelectContent>
                      {subsidiaries.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>{sub.subsidiary_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button onClick={handleAddUser} className="gradient-primary" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Add User
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <Card className="shadow-riana">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-sm text-muted-foreground">SuperAdmins</p>
                <p className="text-2xl font-bold">{roleStats.superadmin}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-riana">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-8 w-8 text-destructive" />
              <div>
                <p className="text-sm text-muted-foreground">Admins</p>
                <p className="text-2xl font-bold">{roleStats.admin}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-riana">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Team Leads</p>
                <p className="text-2xl font-bold">{roleStats.teamlead}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-riana">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-8 w-8 text-secondary" />
              <div>
                <p className="text-sm text-muted-foreground">Users</p>
                <p className="text-2xl font-bold">{roleStats.user}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-riana">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-8 w-8 text-orange-600" />
              <div>
                <p className="text-sm text-muted-foreground">Pending Setup</p>
                <p className="text-2xl font-bold">{roleStats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-riana">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            System Users
          </CardTitle>
          <CardDescription>
            Manage user accounts and permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search users by email or role..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{u.first_name} {u.last_name}</div>
                        <div className="text-sm text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getRoleColor(u.role)}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.phone_number && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {u.phone_number}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(u.is_active !== false)}>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(u.created_at).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {canManageUsers && canManageTarget(u) && (
                        <>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEditUser(u)}
                            className="btn-click-effect"
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                           <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleResetPassword(u)}
                          >
                             Reset Password
                           </Button>
                           <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              setPasswordChangeUser(u);
                              setIsPasswordDialogOpen(true);
                            }}
                          >
                            <Key className="h-3 w-3 mr-1" />
                            Change Password
                           </Button>
                          {canDeleteTarget(u) && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleDeleteUser(u)}
                              className="text-destructive hover:text-destructive"
                            >
                              Delete
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredUsers.length === 0 && (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No users found</p>
            </div>
          )}
          
          {/* Items counter */}
          <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
            Showing {filteredUsers.length} of {users.length} users
          </div>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit User Details
            </DialogTitle>
            <DialogDescription>
              Update user information
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_first_name">First Name</Label>
                  <Input
                    id="edit_first_name"
                    value={editingUser.first_name || ''}
                    onChange={(e) => setEditingUser({...editingUser, first_name: e.target.value})}
                    placeholder="John"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_last_name">Last Name</Label>
                  <Input
                    id="edit_last_name"
                    value={editingUser.last_name || ''}
                    onChange={(e) => setEditingUser({...editingUser, last_name: e.target.value})}
                    placeholder="Doe"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_email">Email Address</Label>
                <Input
                  id="edit_email"
                  type="email"
                  value={editingUser.email || ''}
                  onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                  placeholder="user@riana.co"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_phone">Phone Number</Label>
                <Input
                  id="edit_phone"
                  value={editingUser.phone_number || ''}
                  onChange={(e) => setEditingUser({...editingUser, phone_number: e.target.value})}
                  placeholder="+254700000000"
                />
              </div>
              {isSuperAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="edit_role">Role</Label>
                  <Select value={editingUser.role} onValueChange={(value) => setEditingUser({ ...editingUser, role: value as User['role'] })}>
                    <SelectTrigger id="edit_role">
                      <SelectValue placeholder="Select user role" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role === 'Teamlead' ? 'Team Lead' : role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {isSuperAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="edit_crms_role">Extra Developers Workspace Role</Label>
                  <Select
                    value={editingUser.module_roles?.crms || 'none'}
                    onValueChange={(value) => setEditingUser({
                      ...editingUser,
                      module_roles: {
                        ...(editingUser.module_roles || {}),
                        crms: value === 'none' ? null : value as User['role'],
                      },
                    })}
                  >
                    <SelectTrigger id="edit_crms_role">
                      <SelectValue placeholder="Select Developers access" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No extra Developers access</SelectItem>
                      {crmsAssignableRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role === 'Teamlead' ? 'Team Lead' : role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Grants Developers/CRMS access without managing users from CRMS.
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEditUser} className="gradient-primary btn-click-effect">
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Admin Change Password Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Change User Password
            </DialogTitle>
            <DialogDescription>
              {passwordChangeUser && `Set a new password for ${passwordChangeUser.first_name} ${passwordChangeUser.last_name} (${passwordChangeUser.email})`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="new_password">New Password</Label>
              <Input
                id="new_password"
                type="password"
                value={newPasswordValue}
                onChange={(e) => setNewPasswordValue(e.target.value)}
                placeholder="Enter new password (min 8 characters)"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => {
                setIsPasswordDialogOpen(false);
                setNewPasswordValue('');
                setPasswordChangeUser(null);
              }}>
                Cancel
              </Button>
              <Button 
                onClick={() => passwordChangeUser && handleAdminChangePassword(passwordChangeUser, newPasswordValue)} 
                className="gradient-primary btn-click-effect"
              >
                Change Password
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
