import {motion} from 'motion/react';
import {navigationItems} from '../../../app/navigation';
import {type AppPageId} from '../../../navigation';

export const PlaceholderPage = ({title, pageId}: {title: string; pageId: AppPageId}) => {
  const item = navigationItems.find((navItem) => navItem.id === pageId) ?? navigationItems[0];
  const Icon = item.icon;

  return (
    <motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -10}} className="p-6 h-full flex flex-col items-center justify-center text-center space-y-5 max-w-[1280px] mx-auto">
      <div className="p-8 rounded-[2rem] bg-orange-100 shadow-inner">
        <Icon className="w-20 h-20 text-[#1a4bc4]" strokeWidth={1.5} />
      </div>
      <div>
        <h2 className="text-[28px] font-semibold text-orange-900 mb-3">{title}</h2>
        <p className="text-[14px] text-orange-700/70 max-w-sm mx-auto leading-relaxed">
          该模块已经接入新的路由与布局结构，后续可以继续按模块目录独立演进。
        </p>
      </div>
      <div className="w-full max-w-md mt-8 space-y-4">
        <div className="h-16 w-full bg-white/60 rounded-2xl animate-pulse"></div>
        <div className="h-16 w-full bg-white/60 rounded-2xl animate-pulse delay-75"></div>
        <div className="h-16 w-full bg-white/60 rounded-2xl animate-pulse delay-150"></div>
      </div>
    </motion.div>
  );
};
