import React, { useState } from 'react';

function Header({ user, onCreateRequest, onRefresh, selectedUser, onUserSwitch }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const users = [
    { name: 'Franscisco Kauan', email: 'kauan.ti@grupocoagro.com' },
    { name: 'João Carlos', email: 'joao.carlos@grupocoagro.com' },
    { name: 'Leandro Ademar', email: 'leandro.ademar@grupocoagro.com' },
    { name: 'Eduardo Oliveira', email: 'eduardo.oliveira@grupocoagro.com' },
  ];

  const handleUserSwitch = (userEmail) => {
    onUserSwitch(userEmail);
    setDropdownOpen(false);
  };

  return (
    <header className="main-header">
      <div className="header-content">
        <div className="header-left">
        </div>
        
        <div className="header-right">
          <div className="header-profile">
            <div className="user-switcher">
              <div 
                className="user-menu"
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                <div className="user-avatar">
                  {(selectedUser?.name || 'S').charAt(0)}
                </div>
                <div className="user-info">
                  <span className="user-name">{selectedUser?.name || 'Usuário Suporte'}</span>
                  <span className="user-email">{selectedUser?.email || 'contact@targeted.services'}</span>
                </div>
                <span className="dropdown-arrow">▼</span>
              </div>
              
              {dropdownOpen && (
                <div className="user-dropdown">
                  {users.map((userOption) => (
                    <div
                      key={userOption.email}
                      className={`dropdown-item ${selectedUser?.email === userOption.email ? 'active' : ''}`}
                      onClick={() => handleUserSwitch(userOption.email)}
                    >
                      <span className="dropdown-item-name">{userOption.name}</span>
                      <span className="dropdown-item-email">{userOption.email}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
