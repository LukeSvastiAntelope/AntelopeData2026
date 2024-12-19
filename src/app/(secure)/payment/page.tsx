'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
    Card,
    CardBody,
    CardHeader,
} from "@nextui-org/card";
import { Input } from '@nextui-org/input';
import { Button } from '@nextui-org/button';
import { Select, SelectItem } from '@nextui-org/select';
import { IconWallet, IconCreditCard, IconNft } from "@/app/components/icons"; // You'll need to create these icons

const PaymentPage = () => {
    const { publicKey } = useWallet();
    const [amount, setAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('sol');
    const [withdrawMethod, setWithdrawMethod] = useState('sol');
    const [availableBalance] = useState(0);
    const [withdrawAmount, setWithdrawAmount] = useState('');

    const isWithdrawDisabled = () => {
        return true;
    };

    const handleBuyCredits = async () => {
        if (!amount) return;
        // Implement payment logic
    };

    const handleWithdraw = async () => {
        // Implement withdrawal logic
    };

    const handleMintNFT = async () => {
        // Implement NFT minting logic
    };

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold">Payment & Credits</h1>
                <WalletMultiButton />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Buy Credits Card */}
                <Card className="p-4">
                    <CardHeader className="pb-2">
                        <div className="flex items-center space-x-2">
                            <IconCreditCard />
                            <h2 className="text-2xl font-bold">Buy Credits</h2>
                        </div>
                    </CardHeader>
                    <CardBody className="space-y-6">
                        <div className="text-center bg-default-100 p-4 rounded-lg">
                            <p className="text-xl mb-2">Current Balance</p>
                            <p className="text-3xl font-bold text-primary">0.00 Credits</p>
                        </div>
                        <Input
                            type="number"
                            label="Amount"
                            placeholder="Enter amount"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            startContent={
                                <div className="pointer-events-none flex items-center">
                                    <span className="text-default-400 text-small">$</span>
                                </div>
                            }
                        />
                        <Select
                            label="Payment Method"
                            placeholder="Select payment method"
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                        >
                            <SelectItem key="sol" value="sol" startContent={<IconWallet />}>
                                Pay with SOL
                            </SelectItem>
                            <SelectItem key="usdt" value="usdt" startContent={<IconWallet />}>
                                Pay with USDT
                            </SelectItem>
                            <SelectItem key="stripe" value="stripe" startContent={<IconCreditCard />}>
                                Credit Card
                            </SelectItem>
                        </Select>
                        <Button
                            color="primary"
                            size="lg"
                            className="w-full"
                            onClick={handleBuyCredits}
                        >
                            Buy Credits
                        </Button>
                    </CardBody>
                </Card>

                {/* Withdraw Card */}
                <Card className="p-4">
                    <CardHeader className="pb-2">
                        <div className="flex items-center space-x-2">
                            <IconWallet />
                            <h2 className="text-2xl font-bold">Withdraw Funds</h2>
                        </div>
                    </CardHeader>
                    <CardBody className="space-y-6">
                        <div className="text-center bg-default-100 p-4 rounded-lg">
                            <p className="text-xl mb-2">Available to Withdraw</p>
                            <p className="text-3xl font-bold text-success">{availableBalance} Credits</p>
                        </div>
                        <Input
                            type="number"
                            label="Withdrawal Amount"
                            placeholder="Enter amount to withdraw"
                            value={withdrawAmount}
                            onChange={(e) => setWithdrawAmount(e.target.value)}
                            isDisabled={!publicKey || availableBalance <= 0}
                            startContent={
                                <div className="pointer-events-none flex items-center">
                                    <span className="text-default-400 text-small">$</span>
                                </div>
                            }
                            errorMessage={
                                withdrawAmount && Number(withdrawAmount) > availableBalance
                                    ? "Amount exceeds available balance"
                                    : ""
                            }
                        />
                        <Select
                            label="Withdrawal Method"
                            placeholder="Select withdrawal method"
                            value={withdrawMethod}
                            onChange={(e) => setWithdrawMethod(e.target.value)}
                            isDisabled={!publicKey || availableBalance <= 0}
                        >
                            <SelectItem key="sol" value="sol" startContent={<IconWallet />}>
                                Withdraw as SOL
                            </SelectItem>
                            <SelectItem key="usdt" value="usdt" startContent={<IconWallet />}>
                                Withdraw as USDT
                            </SelectItem>
                            <SelectItem key="bank" value="bank" startContent={<IconCreditCard />}>
                                Bank Transfer
                            </SelectItem>
                        </Select>
                        <Button
                            color="success"
                            size="lg"
                            className="w-full"
                            onClick={handleWithdraw}
                            isDisabled={isWithdrawDisabled()}
                        >
                            {!publicKey 
                                ? "Connect Wallet to Withdraw"
                                : availableBalance <= 0 
                                    ? "No Funds Available"
                                    : "Withdraw Funds"
                            }
                        </Button>
                        {isWithdrawDisabled() && (
                            <p className="text-warning text-sm text-center">
                                No Available Withdrawals
                            </p>
                        )}
                    </CardBody>
                </Card>
            </div>

            {/* NFT Card */}
            <Card className="p-4 mt-6">
                <CardHeader className="pb-2">
                    <div className="flex items-center space-x-2">
                        <IconNft />
                        <h2 className="text-2xl font-bold">NFT Marketplace</h2>
                    </div>
                </CardHeader>
                <CardBody className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h3 className="text-xl font-semibold">Mint New NFT</h3>
                            <p className="text-default-500">
                                Create your unique NFT on the Solana blockchain. Each NFT represents exclusive benefits in our platform.
                            </p>
                            <Button
                                color="secondary"
                                size="lg"
                                className="w-full"
                                onClick={handleMintNFT}
                            >
                                Mint NFT
                            </Button>
                        </div>
                        <div className="bg-default-100 rounded-lg p-4 text-center">
                            <h3 className="text-xl font-semibold mb-2">Your NFT Collection</h3>
                            <p className="text-default-500">0 NFTs owned</p>
                        </div>
                    </div>
                </CardBody>
            </Card>
        </div>
    );
};

export default PaymentPage;