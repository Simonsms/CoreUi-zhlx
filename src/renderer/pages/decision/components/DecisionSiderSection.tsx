import React, { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trophy } from '@icon-park/react';

type DecisionSiderSectionProps = {
  collapsed: boolean;
};

const DecisionSiderSection: React.FC<DecisionSiderSectionProps> = ({ collapsed }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = location.pathname.startsWith('/decision');

  const handleClick = useCallback(() => {
    navigate('/decision');
  }, [navigate]);

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-2 mx-2 my-0.5 rd-1 cursor-pointer
        transition-colors duration-150
        ${isActive ? 'bg-fill-3 text-1' : 'text-2 hover:bg-fill-2'}
      `}
      onClick={handleClick}
      title='决策工作台'
    >
      <Trophy theme='outline' size='16' />
      {!collapsed && <span className='text-sm truncate'>决策工作台</span>}
    </div>
  );
};

export default DecisionSiderSection;
