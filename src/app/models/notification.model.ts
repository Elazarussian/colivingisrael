export interface GroupNotification {
    id?: string;
    userId: string;
    groupId: string;
    groupName: string;
    type: 'group_expired' | 'group_invitation' | 'group_removed';
    message: string;
    read: boolean;
    createdAt: any;
}
