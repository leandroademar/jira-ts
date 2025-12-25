import React from 'react';

function Layout({ children }) {
  return (
    <div className="app-layout">
      <div className="main-content">
        <main className="content-area">
          {children}
        </main>
      </div>
    </div>
  );
}

export default Layout;
