import React, { useState } from 'react';

function SettingsPage({ user, selectedUser, onUserSwitch }) {
  const [activeTab, setActiveTab] = useState('profile');

  const users = [
    { name: 'Targeted Services', email: 'contact@targeted.services' },
    { name: 'Emin Fidan', email: 'efidan@ku.edu.tr' }
  ];

  return (
    <div className="settings-page-content">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your account and preferences</p>
        </div>
      </div>

      {/* Settings Tabs */}
      <div className="settings-tabs">
        <button 
          className={`settings-tab ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Profile
        </button>
        <button 
          className={`settings-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Users
        </button>
        <button 
          className={`settings-tab ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => setActiveTab('about')}
        >
          About
        </button>
      </div>

      {/* Settings Content */}
      <div className="settings-content">
        {activeTab === 'profile' && (
          <div className="settings-section">
            <h2 className="settings-section-title">Profile Information</h2>
            <div className="settings-card">
              {user ? (
                <div className="profile-info">
                  <div className="profile-field">
                    <label>Display Name</label>
                    <div className="profile-value">{user.displayName || 'N/A'}</div>
                  </div>
                  <div className="profile-field">
                    <label>Email Address</label>
                    <div className="profile-value">{user.emailAddress || 'N/A'}</div>
                  </div>
                  <div className="profile-field">
                    <label>Account ID</label>
                    <div className="profile-value">{user.accountId || 'N/A'}</div>
                  </div>
                  <div className="profile-field">
                    <label>Account Type</label>
                    <div className="profile-value">{user.accountType || 'N/A'}</div>
                  </div>
                  {user.timeZone && (
                    <div className="profile-field">
                      <label>Time Zone</label>
                      <div className="profile-value">{user.timeZone}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  <p>User information not available</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="settings-section">
            <h2 className="settings-section-title">User Switching</h2>
            <div className="settings-card">
              <p className="settings-description">
                Switch between different users to view their tickets and manage their requests.
              </p>
              <div className="users-list">
                {users.map((u) => (
                  <div 
                    key={u.email}
                    className={`user-item ${selectedUser.email === u.email ? 'active' : ''}`}
                    onClick={() => onUserSwitch(u.email)}
                  >
                    <div className="user-avatar">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="user-info">
                      <div className="user-name">{u.name}</div>
                      <div className="user-email">{u.email}</div>
                    </div>
                    {selectedUser.email === u.email && (
                      <div className="user-active-indicator">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'about' && (
          <div className="settings-section">
            <h2 className="settings-section-title">About</h2>
            <div className="settings-card">
              <div className="about-content">
                <div className="about-item">
                  <strong>Application Name:</strong>
                  <span>KU Hub Service Request Dashboard</span>
                </div>
                <div className="about-item">
                  <strong>Version:</strong>
                  <span>0.1.0</span>
                </div>
                <div className="about-item">
                  <strong>Description:</strong>
                  <span>A modern React dashboard for managing Jira service requests</span>
                </div>
                <div className="about-item">
                  <strong>Jira API:</strong>
                  <span>REST API v3</span>
                </div>
                <div className="about-item">
                  <strong>Support:</strong>
                  <span>contact@targeted.services</span>
                </div>
              </div>
              <div className="about-footer">
                <p>For support and questions, please contact the development team or create an issue in your Jira project.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsPage;
