import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Spin } from '@arco-design/web-react';

const WorkbenchPage = React.lazy(() => import('./WorkbenchPage'));
const SessionPage = React.lazy(() => import('./SessionPage'));

const fallback = <div className='w-full h-full flex items-center justify-center'><Spin size={32} /></div>;

const DecisionLayout: React.FC = () => {
  return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route index element={<WorkbenchPage />} />
        <Route path='session/:id' element={<SessionPage />} />
      </Routes>
    </Suspense>
  );
};

export default DecisionLayout;
