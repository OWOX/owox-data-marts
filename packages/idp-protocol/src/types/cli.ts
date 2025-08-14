import { Payload } from './models.js';

/**
 * Commands for adding a user to the IDP by app cli.
 */
export interface IdpProviderAddUserCommand {
  addUser(username: string, password?: string): Promise<AddUserCommandResponse>;
}

/**
 * Commands for listing users from the IDP
 */
export interface IdpProviderListUsersCommand {
  listUsers(): Promise<Payload[]>;
}

/**
 * Commands for removing a user from the IDP
 */
export interface IdpProviderRemoveUserCommand {
  removeUser(userId: string): Promise<void>;
}

/**
 * Response for adding a user to the IDP
 */
export interface AddUserCommandResponse {
  username: string;
  magicLink?: string;
}
