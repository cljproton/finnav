'use client';

import {
  Form, Input, Select, Typography, Modal, 
  Table, Card, List, Dropdown, Menu, Tabs,
  Button, Spin, Tag, Space, Divider, Avatar,
  Popover, Tooltip, Badge, Alert, Drawer,
  Descriptions, Tree, Upload, Image, QRCode,
  Segmented, Steps, Timeline, Carousel, Calendar,
  DatePicker, TimePicker, Rate, Slider, Switch,
  Radio, Checkbox, Transfer, Cascader, TreeSelect,
  Mentions, ColorPicker,
  message as staticMessage,
} from 'antd';
import type { ReactNode } from 'react';

// 重新导出所有子组件，解决 Next.js App Router "sub-component" 报错
// Form 子组件
export const FormItem = Form.Item;
export const FormList = Form.List;
export const FormProvider = Form.Provider;

// Input 子组件
export const InputGroup = Input.Group;
export const InputSearch = Input.Search;
export const InputTextArea = Input.TextArea;
export const InputPassword = Input.Password;

// Select 子组件
export const SelectOption = Select.Option;
export const SelectOptGroup = Select.OptGroup;

// Typography 子组件
export const TypographyTitle = Typography.Title;
export const TypographyParagraph = Typography.Paragraph;
export const TypographyText = Typography.Text;
export const TypographyLink = Typography.Link;

// Modal 静态方法
export const ModalConfirm = Modal.confirm;
export const ModalInfo = Modal.info;
export const ModalSuccess = Modal.success;
export const ModalError = Modal.error;
export const ModalWarning = Modal.warning;

// Card 子组件
export const CardMeta = Card.Meta;
export const CardGrid = Card.Grid;

// List 子组件
export const ListItem = List.Item;

// Dropdown 子组件
export const DropdownButton = Dropdown.Button;

// Menu 子组件
export const MenuItem = Menu.Item;
export const MenuSubMenu = Menu.SubMenu;
export const MenuDivider = Menu.Divider;
export const MenuItemGroup = Menu.ItemGroup;

// Tabs 子组件
export const TabPane = Tabs.TabPane;

// Steps 子组件
export const StepsStep = Steps.Step;

// Timeline 子组件
export const TimelineItem = Timeline.Item;

// Descriptions 子组件
export const DescriptionsItem = Descriptions.Item;

// Tree 子组件
export const TreeNode = Tree.TreeNode;

// Upload 子组件
export const UploadDragger = Upload.Dragger;

// Image 子组件
export const ImagePreviewGroup = Image.PreviewGroup;

// DatePicker 子组件
export const DatePickerRangePicker = DatePicker.RangePicker;
export const DatePickerMonthPicker = DatePicker.MonthPicker;
export const DatePickerWeekPicker = DatePicker.WeekPicker;
export const DatePickerQuarterPicker = DatePicker.QuarterPicker;
export const DatePickerYearPicker = DatePicker.YearPicker;

// TimePicker 子组件
export const TimePickerRangePicker = TimePicker.RangePicker;

// TreeSelect 子组件
export const TreeSelectTreeNode = TreeSelect.TreeNode;

// 直接透传所有主组件
export { 
  Form, Input, Select, Typography, Modal, Table, Card, List, Dropdown, Menu, Tabs,
  Button, Spin, Tag, Space, Divider, Avatar, Popover, Tooltip, Badge, Alert, Drawer,
  Descriptions, Tree, Upload, Image, QRCode, Segmented, Steps, Timeline, Carousel, Calendar,
  DatePicker, TimePicker, Rate, Slider, Switch, Radio, Checkbox, Transfer, Cascader, TreeSelect,
  Mentions, ColorPicker
};

// Notification API (备选)
export { notification } from 'antd';

// Message API (替代 Toast) - 核心替换目标
// antd 静态 message 无法消费 ConfigProvider 上下文（如动态主题），
// 这里用代理对象转发给挂在 ConfigProvider 之内的实例（bindMessage 设置），
// 未挂载时回退到 antd 静态方法，保证既有 message.xxx() 调用语法不变。
type BoundMessage = ReturnType<typeof staticMessage.useMessage>[0];

let boundMessage: BoundMessage | null = null;

export function bindMessage(api: BoundMessage) {
  boundMessage = api;
}

export const message = new Proxy(staticMessage, {
  get(target, prop, receiver) {
    const src = boundMessage ?? target;
    const value = Reflect.get(src, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(src);
    }
    return value;
  },
});