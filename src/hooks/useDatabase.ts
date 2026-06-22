import { useState } from 'react';
import { apiClient } from '@/integrations/apiClient';
import { useToast } from '@/hooks/use-toast';
import { calculateSatisfaction } from '@/utils/satisfaction';

export const useDatabase = () => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Industry classifications
  const industryClassifications = [
    'Technology', 'Healthcare', 'Finance', 'Manufacturing', 'Retail',
    'Education', 'Government', 'Non-profit', 'Real Estate', 'Transportation',
    'Energy', 'Media & Entertainment', 'Hospitality', 'Agriculture',
    'Construction', 'Professional Services', 'Other'
  ];

  // Client operations
  const getClients = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get('/clients');
      return data || [];
    } catch (error: any) {
      console.error('Error fetching clients:', error);
      toast({
        title: "Error",
        description: "Failed to fetch clients",
        variant: "destructive",
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  const addClient = async (clientData: any) => {
    try {
      setLoading(true);
      const data = await apiClient.post('/clients', clientData);

      // Log the action (Express backend might handle this, but let's follow the hook's original intent)
      await apiClient.post('/system_logs', {
        user_id: clientData.added_by_user_id,
        action: 'Client Added',
        details: `Added client: ${clientData.client_name}`
      });

      toast({
        title: "Success",
        description: "Client added successfully",
      });
      window.dispatchEvent(new CustomEvent('data-updated'));
      return data;
    } catch (error: any) {
      console.error('Error adding client:', error);
      toast({
        title: "Error",
        description: "Failed to add client",
        variant: "destructive",
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateClient = async (id: string, clientData: any) => {
    try {
      setLoading(true);
      const data = await apiClient.put(`/clients/${id}`, clientData);
      toast({
        title: "Success",
        description: "Client updated successfully",
      });
      window.dispatchEvent(new CustomEvent('data-updated'));
      return data;
    } catch (error: any) {
      console.error('Error updating client:', error);
      toast({
        title: "Error",
        description: "Failed to update client",
        variant: "destructive",
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const deleteClient = async (id: string) => {
    try {
      setLoading(true);
      await apiClient.delete(`/clients/${id}`);
      toast({
        title: "Success",
        description: "Client deleted successfully",
      });
      window.dispatchEvent(new CustomEvent('data-updated'));
    } catch (error: any) {
      console.error('Error deleting client:', error);
      toast({
        title: "Error",
        description: "Failed to delete client",
        variant: "destructive",
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Installation operations
  const getInstallations = async () => {

    try {
      setLoading(true);
      const data = await apiClient.get('/installations');
      return data || [];
    } catch (error: any) {
      console.error('Error fetching installations:', error);
      toast({
        title: "Error",
        description: "Failed to fetch installations",
        variant: "destructive",
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  const addInstallation = async (installationData: any) => {
    try {
      setLoading(true);
      const data = await apiClient.post('/installations', installationData);

      toast({
        title: "Success",
        description: "Installation added successfully",
      });
      window.dispatchEvent(new CustomEvent('data-updated'));
      return data;
    } catch (error: any) {
      console.error('Error adding installation:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add installation",
        variant: "destructive",
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateInstallation = async (id: string, installationData: any) => {
    try {
      setLoading(true);
      const data = await apiClient.patch(`/installations/${id}`, installationData);

      toast({
        title: "Success",
        description: "Installation updated successfully",
      });
      window.dispatchEvent(new CustomEvent('data-updated'));
      return data;
    } catch (error: any) {
      console.error('Error updating installation:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update installation",
        variant: "destructive",
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };


  const updateInstallationStatus = async (id: string, status: string, userId: string, waitingReason?: string) => {
    try {
      setLoading(true);
      const updateData: any = { status };
      if (status === 'waiting' && waitingReason) {
        updateData.waiting_reason = waitingReason;
      }

      await apiClient.patch(`/installations/${id}`, updateData);

      // Log the action
      await apiClient.post('/system_logs', {
        user_id: userId,
        action: 'Installation Status Updated',
        details: `Updated installation status to: ${status}${waitingReason ? ` (Reason: ${waitingReason})` : ''}`
      });

      toast({
        title: "Success",
        description: "Installation status updated successfully",
      });
      window.dispatchEvent(new CustomEvent('data-updated'));
    } catch (error: any) {
      console.error('Error updating installation status:', error);
      toast({
        title: "Error",
        description: "Failed to update installation status",
        variant: "destructive",
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Installation progress operations
  const updateInstallationProgress = async (installationId: string, progressData: any, userId: string) => {
    try {
      setLoading(true);
      await apiClient.post('/installation_progress', {
        installation_id: installationId,
        progress_percentage: progressData.progress_percentage,
        notes: progressData.notes,
        last_updated_by: userId
      });

      toast({
        title: "Success",
        description: "Installation progress updated successfully",
      });
    } catch (error: any) {
      console.error('Error updating installation progress:', error);
      toast({
        title: "Error",
        description: "Failed to update installation progress",
        variant: "destructive",
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // User operations
  const getUsers = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get('/user_profiles');
      return data || [];
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  const createUser = async (userData: any) => {
    try {
      setLoading(true);
      const data = await apiClient.post('/user_profiles', userData);

      const failedDeliveries = (data.welcome_delivery || []).filter((delivery: { error?: string }) => delivery.error);

      toast({
        title: failedDeliveries.length ? "User created with delivery warning" : "User created",
        description: failedDeliveries.length
          ? "The account was created, but one or more welcome messages could not be delivered."
          : "Welcome credentials were sent by email and SMS where a phone number was provided.",
        variant: failedDeliveries.length ? "destructive" : "default",
      });

      return data;
    } catch (error: any) {
      console.error('Error creating user:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Company operations
  const getCompanySettings = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get('/companies');
      return data;
    } catch (error: any) {
      console.error('Error fetching company settings:', error);
      toast({
        title: "Error",
        description: "Failed to fetch company settings",
        variant: "destructive",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateCompanySettings = async (settings: any) => {
    try {
      setLoading(true);
      const data = await apiClient.put('/companies', settings);

      toast({
        title: "Success",
        description: "Company settings updated successfully",
      });

      return data;
    } catch (error: any) {
      console.error('Error updating company settings:', error);
      toast({
        title: "Error",
        description: "Failed to update company settings",
        variant: "destructive",
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };


  // File upload (Mocked for local development)
  const uploadFile = async (file: File, path: string) => {
    try {
      console.log('Local file upload simulated for:', path);
      // In a real local setup, you'd POST to a file upload endpoint
      return URL.createObjectURL(file); 
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast({
        title: "Error",
        description: "Failed to upload file",
        variant: "destructive",
      });
      throw error;
    }
  };

  // Get departments and subsidiaries
  const getDepartments = async () => {
    try {
      return await apiClient.get('/departments');
    } catch (error: any) {
      console.error('Error fetching departments:', error);
      return [];
    }
  };

  const getSubsidiaries = async () => {
    try {
      return await apiClient.get('/subsidiaries');
    } catch (error: any) {
      console.error('Error fetching subsidiaries:', error);
      return [];
    }
  };

  const getFeedbackAnalytics = async () => {
    try {
      const feedbackData = await apiClient.get('/installation_feedback');
      
      const satisfaction = calculateSatisfaction(feedbackData);
      const validNpsResponses = feedbackData
        .map((feedback: any) => Number(feedback.recommendation_score))
        .filter((score: number) => Number.isFinite(score) && score >= 0 && score <= 10);
      const totalFeedback = feedbackData.length;
      const averageRating = satisfaction.averageRating;

      const promoters = validNpsResponses.filter((score: number) => score >= 9).length;
      const passives = validNpsResponses.filter((score: number) => score >= 7 && score <= 8).length;
      const detractors = validNpsResponses.filter((score: number) => score <= 6).length;
      
      const npsScore = validNpsResponses.length > 0
        ? Math.round(((promoters - detractors) / validNpsResponses.length) * 100)
        : 0;

      const csatScore = satisfaction.csatScore;

      const recentFeedback = feedbackData.slice(0, 10).map(feedback => ({
        ...feedback,
        client_name: feedback.clients?.client_name || 'Unknown Client'
      }));

      return {
        totalFeedback,
        averageRating,
        npsScore,
        csatScore,
        promoters,
        passives,
        detractors,
        ratingResponseCount: satisfaction.responseCount,
        npsResponseCount: validNpsResponses.length,
        recentFeedback
      };
    } catch (error) {
      console.error('Error fetching feedback analytics:', error);
      return {
        totalFeedback: 0,
        averageRating: 0,
        npsScore: 0,
        csatScore: 0,
        promoters: 0,
        passives: 0,
        detractors: 0,
        ratingResponseCount: 0,
        npsResponseCount: 0,
        recentFeedback: []
      };
    }
  };

  const updateAssignment = async (id: string, assignmentData: any) => {
    try {
      setLoading(true);
      const data = await apiClient.patch(`/client_assignments/${id}`, assignmentData);
      window.dispatchEvent(new CustomEvent('data-updated'));
      return data;
    } catch (error: any) {
      console.error('Error updating assignment:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update assignment",
        variant: "destructive",
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const getAssignments = async () => {
    try {
      return await apiClient.get('/client_assignments');
    } catch (error: any) {
      console.error('Error fetching assignments:', error);
      return [];
    }
  };

  const addAssignment = async (assignmentData: any) => {
    try {
      setLoading(true);
      const data = await apiClient.post('/client_assignments', assignmentData);
      toast({
        title: "Success",
        description: "Assignment created successfully",
      });
      window.dispatchEvent(new CustomEvent('data-updated'));
      return data;
    } catch (error: any) {
      console.error('Error creating assignment:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create assignment",
        variant: "destructive",
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateEscalationMatrix = async (id: string, matrix: any) => {
    try {
      await apiClient.patch(`/installations/${id}`, { escalation_matrix: matrix });
      toast({
        title: "Success",
        description: "Escalation matrix saved successfully",
      });
    } catch (error: any) {
      console.error('Error saving escalation matrix:', error);
      toast({
        title: "Error",
        description: "Failed to save escalation matrix",
        variant: "destructive",
      });
    }
  };

  const updateUser = async (id: string, userData: any) => {

    try {
      setLoading(true);
      await apiClient.put(`/user_profiles/${id}`, userData);
      toast({
        title: "Success",
        description: "User updated successfully",
      });
    } catch (error: any) {
      console.error('Error updating user:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (id: string) => {
    try {
      setLoading(true);
      await apiClient.delete(`/user_profiles/${id}`);
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
    } catch (error: any) {
      console.error('Error deleting user:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const getFeedbackLinks = async (clientId?: string) => {
    try {
      const url = clientId ? `/feedback_links?client_id=${clientId}` : '/feedback_links';
      return await apiClient.get(url);
    } catch (error: any) {
      console.error('Error fetching feedback links:', error);
      return [];
    }
  };

  const createFeedbackLink = async (linkData: any) => {
    try {
      setLoading(true);
      return await apiClient.post('/feedback_links', linkData);
    } catch (error: any) {
      console.error('Error creating feedback link:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateFeedbackLink = async (id: string, linkData: any) => {
    try {
      await apiClient.patch(`/feedback_links/${id}`, linkData);
    } catch (error: any) {
      console.error('Error updating feedback link:', error);
      throw error;
    }
  };

  const getLatestFeedback = async (clientId: string, installationId: string) => {
    try {
      return await apiClient.get(`/installation_feedback/latest?client_id=${clientId}&installation_id=${installationId}`);
    } catch (error: any) {
      console.error('Error fetching latest feedback:', error);
      return null;
    }
  };

  const adminChangePassword = async (userId: string, newPassword: string) => {

    try {
      await apiClient.patch(`/user_profiles/${userId}/password`, { password: newPassword });
      toast({
        title: "Success",
        description: "Password changed successfully",
      });
    } catch (error: any) {
      console.error('Error changing user password:', error);
      throw error;
    }
  };

  return {
    loading,
    industryClassifications,

    getClients,
    addClient,
    updateClient,
    deleteClient,
    getInstallations,
    addInstallation,
    updateInstallation,
    updateInstallationStatus,
    updateInstallationProgress,
    updateEscalationMatrix,
    getUsers,
    createUser,
    updateUser,
    deleteUser,
    adminChangePassword,
    getCompanySettings,
    updateCompanySettings,
    uploadFile,
    getDepartments,
    getSubsidiaries,
    getAssignments,
    addAssignment,
    updateAssignment,
    getFeedbackAnalytics,


    getFeedbackLinks,
    createFeedbackLink,
    updateFeedbackLink,
    getLatestFeedback
  };

};
