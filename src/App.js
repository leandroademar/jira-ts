import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import CreateIssueForm from './components/CreateIssueForm';
import IssueDetails from './components/IssueDetails';
import Login from './components/Login';
import { fetchCurrentUser, fetchMyTickets } from './api/jira';
import { useAuth } from './contexts/AuthContext';

function App() {
  const { user: authUser, loading: authLoading } = useAuth();
  const [allTickets, setAllTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    if (authUser?.email) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [authUser?.email]);

  const loadData = async () => {
    if (!authUser?.email) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Fetch user data and all project tickets (team view)
      const [userData, ticketsData] = await Promise.all([
        fetchCurrentUser(),
        fetchMyTickets()
      ]);
      
      setUser(userData);
      setAllTickets(ticketsData.issues || ticketsData); // Handle potential {issues: [], ...} structure or direct array
    } catch (err) {
      setError(err.message);
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadData();
  };

  const handleCreateRequest = () => {
    setShowCreateForm(true);
  };

  const handleTicketClick = (ticket) => {
    setSelectedTicket(ticket);
  };

  // Show login if not authenticated
  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p className="loading-text">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <Login />;
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading your Jira tickets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-screen">
        <div className="error-content">
          <h2 className="error-title">Something went wrong</h2>
          <p className="error-message">{error}</p>
          <button onClick={handleRefresh} className="error-retry-btn">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (showCreateForm) {
    return (
      <CreateIssueForm 
        onClose={() => setShowCreateForm(false)} 
        onSuccess={loadData} 
        user={user} 
        selectedUser={{ 
          name: authUser.user_metadata?.full_name || authUser.email, 
          email: authUser.email 
        }} 
      />
    );
  }

  return (
    <>
      <Layout>
        <Dashboard 
          allTickets={allTickets}
          user={user}
          onTicketClick={handleTicketClick}
          selectedTicket={selectedTicket}
          onCreateRequest={handleCreateRequest}
          onRefresh={handleRefresh}
        />
      </Layout>
      
      {selectedTicket && (
        <IssueDetails 
          ticket={selectedTicket} 
          onClose={() => setSelectedTicket(null)}
          user={user}
        />
      )}
    </>
  );
}

export default App;
