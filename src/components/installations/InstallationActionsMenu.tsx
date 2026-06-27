import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Eye, Download, MessageSquarePlus, Upload, Edit, Users, FileText } from "lucide-react";
import { Installation, User } from "@/types";
import { can } from "@/security/accessControl";

interface InstallationActionsMenuProps {
  installation: Installation;
  user: User;
  onView: (installation: Installation) => void;
  onExport: (installation: Installation) => void;
  onFeedback: (installation: Installation) => void;
  onUpload: (installation: Installation) => void;
  onEdit?: (installation: Installation) => void;
  onEscalation?: (installation: Installation) => void;
}

export const InstallationActionsMenu = ({
  installation,
  user,
  onView,
  onExport,
  onFeedback,
  onUpload,
  onEdit,
  onEscalation,
}: InstallationActionsMenuProps) => {
  const canManageInstallations = can(user, 'installations.manage');
  const canExport = can(user, 'reports.view');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 p-0 hover:bg-muted focus-visible:ring-1 focus-visible:ring-primary"
        >
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open actions menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => onView(installation)}>
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </DropdownMenuItem>
        
        {canExport && <DropdownMenuItem onClick={() => onExport(installation)}>
          <Download className="mr-2 h-4 w-4" />
          Export Report
        </DropdownMenuItem>}
        
        <DropdownMenuSeparator />
        
        {canManageInstallations && <DropdownMenuItem onClick={() => onFeedback(installation)}>
          <MessageSquarePlus className="mr-2 h-4 w-4" />
          Generate Feedback
        </DropdownMenuItem>}
        
        {canManageInstallations && <DropdownMenuItem onClick={() => onUpload(installation)}>
          <Upload className="mr-2 h-4 w-4" />
          Upload Handover
        </DropdownMenuItem>}


        
        {onEdit && canManageInstallations && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEdit(installation)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Installation
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
